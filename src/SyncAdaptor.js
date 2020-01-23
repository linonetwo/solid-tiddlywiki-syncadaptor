// @flow
import solidAuthClient from 'solid-auth-client';
import sha1 from 'stable-sha1';
import { basename } from 'path-browserify';
import rdfTranslator from 'rdf-translator/index.es5';
import jsonld from 'jsonld';
import { compact, flatten, omit } from 'lodash';
import allSettled from 'promise.allsettled';
import ldflex from '@solid/query-ldflex';
import { some as somePromise } from 'bluebird';

import { type SoLiDSession } from './SoLiDSessionType';

class SoLiDTiddlyWikiSyncAdaptor {
  wiki: Wiki;

  metaContext = {
    '@vocab': 'http://schema.org/',
    dc: 'http://purl.org/dc/elements/1.1/',
    dcterms: 'http://purl.org/dc/terms/',
    schema: 'https://schema.org/',
    ex: 'http://example.org/vocab#',
  };

  keyContext = {
    created: 'schema:dateCreated',
    creator: 'schema:creator',
    text: 'schema:text',
    title: 'dc:title',
    tags: 'schema:keywords',
    type: 'dc:type',
    modified: 'schema:dateModified',
    modifier: 'schema:contributor',
    _canonical_uri: 'schema:url',
    list: 'schema:ItemList',
  };

  jsonLdContext = { ...this.metaContext, ...this.keyContext };

  constructor(options: { wiki: Wiki }) {
    this.wiki = options.wiki;
    $tw.rootWidget.addEventListener('tm-login-solid', this.login);
    // sync config to here
    $tw.rootWidget.addEventListener('tm-solid-use-server-story-list', () => {
      this.useServerStoryList = true;
    });
    $tw.rootWidget.addEventListener('tm-solid-not-use-server-story-list', () => {
      this.useServerStoryList = false;
    });

    this.startPreFetchFromQueue();
  }

  // don't save story list at the beginning of opening, so we can use story list synced from the server after a while
  useServerStoryList: boolean = true;

  loadedStoryList: boolean = false;

  /**
   * Gets the supplemental information that the adaptor needs to keep track of for a particular tiddler. For example, the TiddlyWeb adaptor includes a bag field indicating the original bag of the tiddler.
   * Executed after constructor()
   * @param tiddler Target tiddler
   */
  getTiddlerInfo(tiddler: Tiddler) {
    return {
      solid:
        tiddler.fields.creator &&
        this.getTiddlerContainerPath(tiddler.fields.title, tiddler.fields.creator.replace('profile/card#me', ''))
          .fileLocation,
    };
  }

  /**
   * Retrieves status information from the server. This method is optional.
   * Executed after getTiddlerInfo()
   * @param {(err,isLoggedIn,username) => void} callback
   */
  getStatus(callback: (error?: Error, isLoggedIn: boolean, username?: string) => void) {
    solidAuthClient.trackSession(session => {
      if (!session) {
        // The user is not logged in
        callback(undefined, false);
      } else {
        // `The user is ${session.webId}`
        callback(undefined, true, session.webId);
      }
    });
  }

  /** Attempts to login to the server with specified credentials. This method is optional. */
  async login() {
    let session = await solidAuthClient.currentSession();
    if (!session) {
      session = await solidAuthClient.popupLogin({ popupUri: 'https://solid.authing.cn/common/popup.html' });
      (session: SoLiDSession);
    }
    // https://github.com/Jermolene/TiddlyWiki5/issues/3937
    $tw.rootWidget.dispatchEvent({ type: 'tm-server-refresh' });
  }

  /** Attempts to logout of the server. This method is optional. */
  logout(callback: Function) {
    console.log('logout');
    solidAuthClient.logout().then(callback);
  }

  /**
   * Retrieves a list of skinny tiddlers from the server.
   * This method is optional. If an adaptor doesn't implement it then synchronisation will be unidirectional from the TiddlyWiki store to the adaptor, but not the other way.
   * get called here https://github.com/Jermolene/TiddlyWiki5/blob/07198b9cda12da82fc66dcf0589d6a9caab1cdf6/core/modules/syncer.js#L208
   */
  async getSkinnyTiddlers(callback: (error?: Error, tiddlers: TiddlerFields[]) => void) {
    const isLoggedIn = this.wiki.getTiddlerText('$:/status/IsLoggedIn');
    if (isLoggedIn !== 'yes') {
      this.navigateToLogin();
      callback(undefined, []);
      return;
    }
    /*
    use the following strategy to speed up the initial load speed:

      1. only load title from the container on the startup.
      2. load all metadata (maybe a little expensive) on the second getSkinnyTiddlers(), maybe these metadata will be used in searching? (I'm not sure about this!)
      3. only load title and modified from the container on subsequent getSkinnyTiddlers(), only for TW to determine whether to trigger loadTiddler(). (In case you have changes from other devices or other people in your collaboration team.)
    */

    const containerTtlFiles = await this.getTWContainersOnPOD();
    const getAllItemTasks: Promise<TiddlerFields[]>[] = containerTtlFiles.map(async containerURI => {
      // need trailing slash https://forum.solidproject.org/t/ls-ldp-container-using-ldflex/2522/2
      const items = ldflex[`${containerURI}/`]['ldp:contains'];
      // task array for Promise.all, read all files concurrently
      const getItemTasks: Promise<TiddlerFields>[] = [];
      for await (const item of items) {
        // get all metadata files
        const fileURI = String(item);
        if (fileURI.endsWith('.metadata')) {
          getItemTasks.push(this.getJSONLDFromURI(fileURI));
        }
      }
      return Promise.all(getItemTasks);
    });
    getAllItemTasks.forEach(async (task) => {
      const metaDataList = await task;
      // preFetch content
      metaDataList.map(({ title }) => this.enqueuePreFetch(title));
      // load metadata
      callback(undefined, metaDataList);
    })
  }

  /**
   * Saves a tiddler to the server.
   * Soon executed after getStatus()
   * @param {(err,adaptorInfo,revision) => void} callback
   * @param {Object} tiddlerInfo The tiddlerInfo maintained by the syncer.getTiddlerInfo() for this tiddler
   */
  async saveTiddler(
    tiddler: Tiddler,
    callback: (error?: Error, adaptorInfo?: Object, revision?: string) => void
    // tiddlerInfo: Object,
  ) {
    const isLoggedIn = this.wiki.getTiddlerText('$:/status/IsLoggedIn');
    if (isLoggedIn !== 'yes') {
      this.navigateToLogin();
      callback(undefined);
      return;
    }
    // FEATURE: use-server-story-list prevent story list tiddler (main page) to overwrite the server side story list on the initial start up (when story list from server haven't loaded)
    if (tiddler.fields.title === '$:/StoryList' && !this.loadedStoryList && this.useServerStoryList) {
      callback(undefined);
      return;
    }
    // update file located at tiddler.fields.title
    let { fileLocation } = this.getTiddlerContainerPath(tiddler.fields.title, tiddler.fields.solid);
    if (!fileLocation.startsWith('http')) {
      fileLocation = `${await this.getPodUrl()}/${fileLocation}`;
    }
    try {
      // use PUT to override or create
      // make metadata json-ld, then convert to turtle
      // try this in https://runkit.com/linonetwo/5cd54c8a0a18bf001b479c2a
      const metadataJsonLd = omit(tiddler.fields, ['text']);
      metadataJsonLd['@context'] = this.jsonLdContext;
      // TODO: relative URI is buggy https://bitbucket.org/alexstolz/rdf-translator/issues/7/handle-relative-uri , so not using relative url here, instead, use full url
      metadataJsonLd['@id'] = fileLocation;
      // rdf Translate from json-ld to n3
      const metadata: string = await rdfTranslator(JSON.stringify(metadataJsonLd), 'json-ld', 'n3');
      // creating ${fileLocation} use ${contentType} with metadata ${metadata}
      const contentType = tiddler.fields.type || 'text/vnd.tiddlywiki';
      // saveTiddler
      await this.createFileOrFolder(fileLocation, contentType, tiddler.fields.text, metadata);
      // saveTiddler requires tiddler.fields.title and adaptorInfo: Object.keys(tiddler.fields), and revision: sha1(tiddler.fields)
      callback(undefined, { solid: fileLocation }, sha1(tiddler.fields));
    } catch (error) {
      callback(error, { solid: fileLocation }, sha1(tiddler.fields));
      console.error(error);
      throw new Error(`SOLID005 saveTiddler() ${error}`);
    }
  }

  /** Loads a tiddler from the server, with its text field
   * @param {string} title Title of tiddler to be retrieved
   * @param {(err,tiddlerFields) => void} callback See https://tiddlywiki.com/#TiddlerFields
   */
  async loadTiddler(title: string, callback: (error?: Error, tiddlerFields?: TiddlerFields) => void) {
    // FEATURE: use-server-story-list only load story list on the first time
    if (title === '$:/StoryList') {
      if (this.loadedStoryList) return callback();
      if (!this.useServerStoryList) return callback();
      this.loadedStoryList = true;
    }
    const podUrl = await this.getPodUrl();
    try {
      const tryGetFilesInEachContainerTasks = this.getTWContainersList().map(async path => {
        const { fileLocation } = this.getTiddlerContainerPath(title, path);
        const fileUrl = fileLocation.startsWith('http') ? fileLocation : `${podUrl}${fileLocation}`;
        const metaUrl = `${fileUrl}.metadata`;
        const [{ value: text }, { value: metadata }]: Array<{ value?: Object | string | null }> = await allSettled([
          // TODO: dealt with non text tiddlers, now this.processResponse will do res.text()
          solidAuthClient.fetch(fileUrl).then(this.processResponse),
          this.getJSONLDFromURI(metaUrl),
        ]);
        if (typeof text !== 'string' || typeof metadata !== 'object') {
          throw new Error();
        }
        return [text, metadata];
      });
      const result: Array<Array<?Object | ?string | null>> = await somePromise(tryGetFilesInEachContainerTasks, 1);

      if (compact(flatten(result)).length > 0) {
        for (let index = 0; index < result.length; index += 1) {
          const [text, metadata] = result[index];
          if (typeof text === 'string' && typeof metadata === 'object') {
            const tiddler = { title, text, ...metadata };
            callback(undefined, tiddler);
            return;
          }
        }
      }
    } catch (error) {
      console.error('SOLID008 loadTiddler()', title, podUrl, error);
    }
    callback(
      new Error(`loadTiddler() ${title} no found in all Container Path, or it don't have metadata in all Containers`)
    );
  }

  /** Delete a tiddler from the server.
   * @param {string} title Title of tiddler to be deleted
   * @param {Function} callback Callback function invoked with parameter err
   * @param {Object} tiddlerInfo The tiddlerInfo maintained by the syncer.getTiddlerInfo() for this tiddler
   */
  async deleteTiddler(title: string, callback: (error?: Error) => void, tiddlerInfo: Object) {
    // delete file located at title, title itself is a path
    const { fileLocation } = this.getTiddlerContainerPath(title, tiddlerInfo.solid);
    try {
      // delete and recreate
      const fileURI = `${await this.getPodUrl()}${fileLocation}`;
      await Promise.all([
        solidAuthClient.fetch(fileURI, { method: 'DELETE' }),
        solidAuthClient.fetch(`${fileURI}.metadata`, { method: 'DELETE' }),
      ]);
      callback(undefined);
    } catch (error) {
      callback(error);
      throw new Error(`SOLID006 deleteTiddler() ${error}`);
    }
  }

  // ____  ____  ________  _____     _______  ________  _______
  // |_   ||   _||_   __  ||_   _|   |_   __ \|_   __  ||_   __ \
  //   | |__| |    | |_ \_|  | |       | |__) | | |_ \_|  | |__) |
  //   |  __  |    |  _| _   | |   _   |  ___/  |  _| _   |  __ /
  //  _| |  | |_  _| |__/ | _| |__/ | _| |_    _| |__/ | _| |  \ \_
  // |____||____||________||________||_____|  |________||____| |___|

  /**
   *
   * @param {*} title
   * @param {*} solid
   */
  async getJSONLDFromURI(uri: string): Promise<Object> {
    const metadataTtl = await solidAuthClient.fetch(uri).then(this.processResponse);
    // TODO: list inside metadata JSON will out of order when translated back from n3
    const expandedJSONLD = await rdfTranslator(metadataTtl, 'n3', 'json-ld');
    try {
      const compactJSONLD = await jsonld.compact(JSON.parse(expandedJSONLD), this.jsonLdContext);
      return omit(compactJSONLD, ['@id', '@context']);
    } catch (error) {
      console.error('SOLID007 getJSONLDFromURI() failed', error, expandedJSONLD);
    }
  }

  /**
   * given a tiddler 's title and container path ('solid'), return file full relative path to hostname
   * will perform `encodeURIComponent(title) twice`
   */
  getTiddlerContainerPath(title: string, solid?: string) {
    // assign it with a default container if it doesn't have one
    let containerPath = solid;
    if (!containerPath) {
      [containerPath] = this.getTWContainersList();
    }
    // https://forum.solidproject.org/t/how-to-store-file-with-in-its-name/1816
    const fileLocation = `${containerPath}/${encodeURIComponent(encodeURIComponent(title))}`;
    return { fileLocation, containerPath };
  }

  /**
   * get containers list and guard to check it exists
   * @returns an array with at least one string, or it will throw
   * @param forceWriteable boolean When set to true, it will check if "TWContainers" field in the Config is filled, so we have place to write data.
   */
  getTWContainersList(forceWriteable: boolean = false) {
    const containerPathsString: string =
      this.wiki.getTiddlerText('$:/plugins/linonetwo/solid-tiddlywiki-syncadaptor/TWContainers') || '';
    const readableContainerPathsString: string =
      this.wiki.getTiddlerText('$:/plugins/linonetwo/solid-tiddlywiki-syncadaptor/TWReadableContainers') || '';
    let containerPaths: Array<string> = compact(containerPathsString.split('\n'));
    if (forceWriteable) {
      if (!containerPathsString) {
        throw new Error(
          'SOLID000 getTWContainersList() get called while Containers textarea is unfilled, abort login()'
        );
      }
      if (!containerPaths.length === 0) {
        throw new Error(
          'SOLID000 getTWContainersList() get called while Containers textarea is unfilled, abort login()'
        );
      }
    }
    // currently Node Solid Server supports following root location
    if (
      !containerPaths.every(
        path =>
          path.startsWith('/public') ||
          path.startsWith('/private') ||
          path.startsWith('/inbox') ||
          path.startsWith('/profile')
      )
    ) {
      throw new Error(
        `SOLID001 getTWContainersList() get called, but some Containers is invalid ${JSON.stringify(
          containerPaths,
          null,
          '  '
        )}`
      );
    }
    // add readable location, which are full URIs to some PODs
    let readableContainerPaths: string[] = [];
    if (readableContainerPathsString) {
      readableContainerPaths = compact(readableContainerPathsString.split('\n'));
      if (!readableContainerPaths.every(path => path.startsWith('https://'))) {
        throw new Error(
          `SOLID001 getTWContainersList() get called, but some ReadableContainers is invalid ${JSON.stringify(
            readableContainerPaths,
            null,
            '  '
          )}`
        );
      }
    }
    containerPaths = [...containerPaths, ...readableContainerPaths];
    return containerPaths;
  }

  async getPodUrl() {
    const session: SoLiDSession | null = await solidAuthClient.currentSession();
    const currentWebIDString: ?string = session?.webId;

    // guards
    if (!currentWebIDString) {
      throw new Error('SOLID002 getPodUrl() get called without login, abort login()');
    }
    let currentWebIdURL;
    try {
      currentWebIdURL = new URL(currentWebIDString);
    } catch (error) {
      throw new Error(`SOLID003 getPodUrl() receives bad WebID ${currentWebIDString}`);
    }

    // try access files
    const port = currentWebIdURL.port && currentWebIdURL.port !== 80 ? `:${currentWebIdURL.port}` : '';
    const podUrl = `${currentWebIdURL.protocol}//${currentWebIdURL.hostname}${port}`;
    return podUrl;
  }

  /** Scan index files, return the content, create if no exists */
  async getTWContainersOnPOD(): Promise<string[]> {
    // collect info to build URL of containers
    const podUrl = await this.getPodUrl();
    const containerPaths = this.getTWContainersList();
    const containerURIs = containerPaths.map(path => (path.startsWith('http') ? path : `${podUrl}${path}`));
    return containerURIs;
  }

  folderSymbol = Symbol('folder');

  /**
   * Recursively create parent folder (using PUT xxx.metadata.ttl) then create the file (xxx.ttl) itself
   * If creating container, please include tailing slash "/"
   * If creating resource, please DO NOT include tailing extension ".txt" [NSS will add extension](https://github.com/solid/node-solid-server/blob/19d1bf0ff5a9a59bb59300b8fce3bfcd038d0ea7/lib/handlers/post.js#L86)
   * I don't use *.meta , since trying to delete *.meta will resulted in "trying to regard meta file as regular file" or so, quite annoying
   * @param {string} url the file or folder url to be created
   * @param {string} [metaContent=''] optional metadata, should be turtle
   */
  async createFileOrFolder(
    url: string,
    contentType: string = 'text/turtle',
    content: Symbol | string = this.folderSymbol,
    metaContent: string = ''
  ) {
    // create meta file first, dealing all possible error
    const metaUrl = `${url}.metadata`;
    try {
      // let parent folder create a resource named ${slug}
      const creationResponse: Response = await solidAuthClient.fetch(metaUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/turtle' },
        body: metaContent,
      });
      // handling errors
      // check it's 201 Created
      if (creationResponse.statusText === 'Origin Unauthorized') {
        throw new Error(`
          You need to trust ${
            typeof window !== 'undefined' ? window.location.origin : ' this app'
          } in SoLiD Panel. See https://github.com/linonetwo/solid-tiddlywiki-syncadaptor#if-you-can-not-access-private-resources

          Please goto YourWebID > Preferences > Manage your trusted applications, and add ${
            window.location.origin
          } to the list, give it Write and Append permissions.
          `);
      }
      if (creationResponse.status !== 201) {
        throw new Error(`${creationResponse.status}, ${creationResponse.statusText}`);
      }
    } catch (error) {
      throw new Error(`SOLID004 createFileOrFolder() creating ${metaUrl} failed with ${error}`);
    }
    // folder is created recursively by PUT
    if (typeof content === 'string') {
      // now that container exists (created by PUT), and all possible errors are gone, we can create the file it self
      // we should have use POST for this so we can tell container that '<xxx.meta.ttl>; rel="describedby"' in Link , but it is buggy in solid (https://forum.solidproject.org/t/error-saving-back-error-web-error-409-conflict-on-put/1011/6)
      /** let parent folder create a resource named ${slug} */
      const slug = basename(url);
      const link = `<http://www.w3.org/ns/ldp#Resource>; rel="type", <${slug}.metadata>; rel="describedby"`;
      try {
        const creationResponse: Response = await solidAuthClient.fetch(url, {
          method: 'PUT',
          headers: { link, 'content-type': contentType },
          body: content,
        });
        if (creationResponse.status !== 201) {
          throw new Error(`${creationResponse.status}, ${creationResponse.statusText}`);
        }
      } catch (error) {
        throw new Error(`SOLID004 createFileOrFolder() creating ${url} failed with ${error}`);
      }
    }
  }

  navigateToLogin() {
    console.warn("SOLID009 can't getSkinnyTiddlers or save while not logged in, navigate to plugin about page");
    $tw.rootWidget.dispatchEvent({
      type: 'tm-navigate',
      navigateTo: '$:/plugins/linonetwo/solid-tiddlywiki-syncadaptor/about',
    });
  }

  preFetchQueue = [];

  preFetchDeduplicationSet = new Set<string>();

  enqueuePreFetch(title: string) {
    if (!this.preFetchDeduplicationSet.has(title)) {
      this.preFetchQueue.push(title);
    }
  }

  startPreFetchFromQueue() {
    setInterval(async () => {
      if (this.preFetchQueue.length > 0) {
        const title = this.preFetchQueue.pop();
        await this.swrFetchTiddler(title);
        this.preFetchDeduplicationSet.delete(title);
      }
    }, Math.random() * 100);
  }

  async swrFetchTiddler(title: string) {
    const cachedTiddler = localStorage.getItem(`tiddlerCache://${title}`);
    if (typeof cachedTiddler === 'string') {
      $tw.syncer.storeTiddler(JSON.parse(cachedTiddler));
    }
    this.loadTiddler(title, (error, tiddlerFields) => {
      if (!error && typeof tiddlerFields === 'object') {
        $tw.syncer.storeTiddler(tiddlerFields);
        localStorage.setItem(`tiddlerCache://${title}`, JSON.stringify(tiddlerFields));
      }
    });
  }

  processResponse = (res: Response) => (res.status === 200 ? res.text() : Promise.reject(res.status));
}

// only run this on the browser
// eslint-disable-next-line
if ($tw && $tw.browser) exports.adaptorClass = SoLiDTiddlyWikiSyncAdaptor;

declare var $tw: any;

type Tiddler = {
  fields: TiddlerFields,
  cache: any,
};
type TiddlerFields = {
  /** The unique name of a tiddler */
  title: string,
  /** The body text of a tiddler, not required in getSkinnyTiddlers() */
  text?: string,
  /**
   * A Date like object, The date and time at which a tiddler was last modified
   * can be parsed by new Date(Date.parse())
   */
  modified?: Object,
  /**	The tiddler title associated with the person who last modified a tiddler */
  modifier?: string,
  /**
   * A Date like object, The date a tiddler was created
   * can be parsed by new Date(Date.parse())
   */
  created?: Object,
  /**	The name of the person who created a tiddler */
  creator?: string,
  /**	A list of tags associated with a tiddler */
  tags?: string[],
  /**	The content type of a tiddler */
  type?: string,
  /**	An ordered list of tiddler titles associated with a tiddler */
  list?: string[],
  /**	The text to be displayed on a tab or button */
  caption?: string,
  /** used to check whether a tiddler needs update */
  revision?: string,
  /** our custom field, a URI determine where to store it */
  solid?: string,
};

type Wiki = {
  addTiddler: Function,
  deleteTiddler: Function,
  getTiddler: Function,
  getTiddlerText: string => ?string,
  allTitles: Function,
  each: Function,
  allShadowTitles: Function,
  eachShadow: Function,
  eachTiddlerPlusShadows: Function,
  eachShadowPlusTiddlers: Function,
  tiddlerExists: Function,
  isShadowTiddler: Function,
  getShadowSource: Function,
  readPluginInfo: Function,
  getPluginInfo: Function,
  registerPluginTiddlers: Function,
  unregisterPluginTiddlers: Function,
  unpackPluginTiddlers: Function,
  caches: Object,
  globalCache: Object,
  changedTiddlers: Object,
  changeCount: Object,
  eventListeners: Object,
  eventsTriggered: boolean,
};
