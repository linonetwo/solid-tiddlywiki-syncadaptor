// @flow
import solidAuthClient from 'solid-auth-client';
import sha1 from 'stable-sha1';
import { dirname, basename } from 'path-browserify';
import { newEngine } from '@comunica/actor-init-sparql-rdfjs';
import { Store, Parser } from 'n3';
import { compact } from 'lodash';

import { type SoLiDSession } from './SoLiDSessionType';

class SoLiDTiddlyWikiSyncAdaptor {
  wiki: Wiki;

  constructor(options: { wiki: Wiki }) {
    this.wiki = options.wiki;
    console.log('constructor');
    $tw.rootWidget.addEventListener('tm-login-solid', this.login);
  }

  /**
   * Gets the supplemental information that the adaptor needs to keep track of for a particular tiddler. For example, the TiddlyWeb adaptor includes a bag field indicating the original bag of the tiddler.
   * Executed after constructor()
   * @param tiddler Target tiddler
   */
  getTiddlerInfo(tiddler: Tiddler) {
    console.log(
      'getTiddlerInfo',
      tiddler.fields.title,
      this.getTiddlerContainerPath(tiddler.fields.title, tiddler.fields.solid),
    );
    return {
      solid: this.getTiddlerContainerPath(tiddler.fields.title, tiddler.fields.solid).containerPath,
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
    const popupUri = 'https://solid.community/common/popup.html';
    if (!session) {
      session = await solidAuthClient.popupLogin({ popupUri });
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
  async getSkinnyTiddlers(callback: (error?: Error, tiddlers: Tiddler[]) => void) {
    const isLoggedIn = this.wiki.getTiddlerText('$:/status/IsLoggedIn');
    if (isLoggedIn !== 'yes') {
      callback(undefined, []);
      console.warn('cant getSkinnyTiddlers while not logged in');
      // TODO: this function get called even not logged in, maybe pop up something friendly only once to notify user?
      return;
    }
    console.log('getSkinnyTiddlers');
    // this will create a index for tiddlywiki on the POD if we don't have one
    // and return turtle files describing all tiddlers' metadata

    this.updateIndexStore();
    const queryEngine = newEngine();
    const result = await queryEngine.query('SELECT * { ?s ?p ?o }', {
      sources: [{ type: 'rdfjsSource', value: this.store }],
    });
    result.bindingsStream.on('data', data => {
      console.log(data.get('?s').value, data.get('?p').value, data.get('?o').value);
    });
    result.bindingsStream.on('end', data => {
      console.log(`on('end',`, data);
    });

    callback(undefined, []);
  }

  /**
   * Saves a tiddler to the server.
   * Soon executed after getStatus()
   * @param {(err,adaptorInfo,revision) => void} callback
   * @param {Object} tiddlerInfo The tiddlerInfo maintained by the syncer.getTiddlerInfo() for this tiddler
   */
  async saveTiddler(
    tiddler: Tiddler,
    callback: (error?: Error, adaptorInfo?: Object, revision?: string) => void,
    // tiddlerInfo: Object,
  ) {
    const isLoggedIn = this.wiki.getTiddlerText('$:/status/IsLoggedIn');
    if (isLoggedIn !== 'yes') {
      // callback(new Error('cant save while not logged in'));
      console.warn('cant save while not logged in');
      callback(undefined);
      // TODO: this function get called even not logged in, maybe pop up something friendly only once to notify user?
      return;
    }
    // update file located at tiddler.fields.title
    const { fileLocation, containerPath } = this.getTiddlerContainerPath(tiddler.fields.title, tiddler.fields.solid);
    try {
      const podUrl = await this.getPodUrl();
      // delete and recreate
      console.log('deleting', `${podUrl}${fileLocation}`);
      await solidAuthClient.fetch(`${podUrl}${fileLocation}`, { method: 'DELETE' });
      // recreate
      // TODO: make it jsonld to turtle
      const content = JSON.stringify(tiddler, null, '  ');
      const contentType = tiddler.fields.type || 'text/vnd.tiddlywiki';
      console.log('creating', `${podUrl}${fileLocation}`, contentType, content);
      await this.createFileOrFolder(`${podUrl}${fileLocation}`, contentType, content);
      const metadata = `
@prefix schema: <http://https://schema.org/#>.

<>
    schema:keywords "SomeTag, AnotherTag".
`;
      console.log('creating', `${podUrl}${fileLocation}.meta`, 'text/turtle', metadata);

      await this.createFileOrFolder(`${podUrl}${fileLocation}.meta`, 'text/turtle', metadata);
      console.log('saveTiddler', tiddler.fields.title, Object.keys(tiddler.fields), sha1(tiddler.fields));
      callback(undefined, { solid: containerPath }, sha1(tiddler.fields));
    } catch (error) {
      callback(error, { solid: containerPath }, sha1(tiddler.fields));
      throw new Error(`SOLID005 saveTiddler() ${error}`);
    }
  }

  /** Loads a tiddler from the server, with its text field
   * @param {string} title Title of tiddler to be retrieved
   * @param {(err,tiddlerFields) => void} callback See https://tiddlywiki.com/#TiddlerFields
   */
  async loadTiddler(title: string, callback: (error?: Error, tiddlerFields?: Tiddler) => void) {
    console.log('loadTiddler', title);
    const podUrl = await this.getPodUrl();
    const result = await Promise.all(
      this.getTWContainersList().map(path => {
        const { fileLocation } = this.getTiddlerContainerPath(title, path);
        return solidAuthClient
          .fetch(`${podUrl}${fileLocation}`)
          .then((res: Response) => (res.status === 200 ? res.text() : null));
      }),
    );
    if (result.length > 0) {
      // TODO: turtle to jsonLD
      // TODO: .replace('dollar__', '$:');
      callback(undefined, {});
    } else {
      callback(new Error('loadTiddler() no found in all Container Path'));
    }
  }

  /** Delete a tiddler from the server.
   * @param {string} title Title of tiddler to be deleted
   * @param {Function} callback Callback function invoked with parameter err
   * @param {Object} tiddlerInfo The tiddlerInfo maintained by the syncer.getTiddlerInfo() for this tiddler
   */
  async deleteTiddler(title: string, callback: (error?: Error) => void, tiddlerInfo: Object) {
    // delete file located at title, title itself is a path
    console.log('deleteTiddler', title);
    const { fileLocation } = this.getTiddlerContainerPath(title, tiddlerInfo.solid);
    try {
      // delete and recreate
      await solidAuthClient.fetch(fileLocation, { method: 'DELETE' });
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

  store = new Store();

  /** load containers turtle files and clear the store then add them to store */
  async updateIndexStore() {
    const containerTtlFiles = await this.getTWContainersOnPOD();

    this.store = new Store();
    // const session: SoLiDSession = await solidAuthClient.currentSession();
    const parsedRdfQuads = containerTtlFiles.map(({ uri, text }) => {
      const parser = new Parser({ format: 'Turtle', baseIRI: uri });
      return parser.parse(text);
    });
    parsedRdfQuads.forEach(quads => this.store.addQuads(quads));
  }

  /**
   * given a tiddler 's title and container path ('solid'), return file full relative path to hostname
   * will perform title.replace('$:', 'dollar__');
   */
  getTiddlerContainerPath(title: string, solid?: string) {
    // assign it with a default container if it doesn't have one
    let containerPath = solid;
    if (!containerPath) {
      [containerPath] = this.getTWContainersList();
    }
    const fileLocation = `${containerPath}/${title}`.replace('$:', 'dollar__');
    return { fileLocation, containerPath };
  }

  /**
   * get containers list and guard to check it exists
   * @returns an array with at least one string, or it will throw
   */
  getTWContainersList() {
    const containerPathsString = this.wiki.getTiddlerText(
      '$:/plugins/linonetwo/solid-tiddlywiki-syncadaptor/TWContainers',
    );
    if (!containerPathsString) {
      throw new Error('SOLID000 getTWContainersList() get called while Containers textarea is unfilled, abort login()');
    }
    const containerPaths: Array<string> = compact(containerPathsString.split('\n'));
    if (!containerPaths.length === 0) {
      throw new Error('SOLID000 getTWContainersList() get called while Containers textarea is unfilled, abort login()');
    }
    // currently Node Solid Server supports following root location
    if (
      !containerPaths.every(
        path =>
          path.startsWith('/public') ||
          path.startsWith('/private') ||
          path.startsWith('/inbox') ||
          path.startsWith('/profile'),
      )
    ) {
      throw new Error(
        `SOLID001 getTWContainersList() get called, but some Containers is invalid ${JSON.stringify(
          containerPaths,
          null,
          '  ',
        )}`,
      );
    }
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
    const podUrl = `${currentWebIdURL.protocol}//${currentWebIdURL.hostname}`;
    return podUrl;
  }

  /** Scan index files, return the content, create if no exists */
  async getTWContainersOnPOD(): Promise<{ uri: string, text: string }[]> {
    const podUrl = await this.getPodUrl();
    const indexFiles = this.getTWContainersList();
    const fileURIs = indexFiles.map(path => `${podUrl}${path}`);
    const fileContents = await Promise.all(
      fileURIs.map(uri =>
        solidAuthClient
          .fetch(uri)
          .then(async (res: Response) => {
            // might be 401 for /private , 403 for ACL blocking , 404 for uncreated, 200 for good
            return { status: res.status, uri, text: await res.text() };
          })
          .catch(error => {
            console.error(uri, error);
          }),
      ),
    );
    console.log('fileContents', fileContents);
    await Promise.all(
      fileContents
        .filter(item => item.status === 404)
        .map(itemToCreate => {
          return this.createFileOrFolder(itemToCreate.uri, 'text/turtle', true);
        }),
    );

    return fileContents.filter(item => item.status === 200);
  }

  folderSymbol = Symbol('folder');

  /**
   * Recursively create parent folder then the file itself
   * This function only creates turtle file ends with .ttl
   * Or folder ends without slash
   * @param {string} uri the file or folder uri to be created
   */
  async createFileOrFolder(
    url: string,
    contentType: string = 'text/turtle',
    content: Symbol | string = this.folderSymbol,
  ) {
    // first check if folder exists, so we can put this file inside
    const urlObj = new URL(url);
    const pathName = urlObj.pathname;
    const hostName = urlObj.hostname;
    const fileOrFolderNameToCreate = basename(url);
    const parentFolder = dirname(pathName);
    const parentUrl = `https://${hostName}${parentFolder}`;
    if (parentFolder !== '/') {
      const parentFolderResponse: Response = await solidAuthClient.fetch(parentUrl);
      if (parentFolderResponse.status === 404) {
        await this.createFileOrFolder(parentUrl);
      }
    }
    // parent folder now exists, create the thing itself
    const link =
      content === this.folderSymbol
        ? '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"'
        : '<http://www.w3.org/ns/ldp#Resource>; rel="type"';
    const init = {
      method: 'POST',
      headers: { slug: fileOrFolderNameToCreate, link, 'Content-Type': contentType },
      body: content === this.folderSymbol ? '' : content,
    };
    try {
      // let parent folder create a resource named ${slug}
      const creationResponse: Response = await solidAuthClient.fetch(parentUrl, init);
      // check it's 201 Created
      if (creationResponse.status !== 201) {
        throw new Error(`${creationResponse.status}, ${creationResponse.statusText}`);
      }
    } catch (error) {
      throw new Error(
        `SOLID004 createFileOrFolder() creating ${fileOrFolderNameToCreate} on ${parentUrl} failed with ${error}`,
      );
    }
  }
}

// only run this on the browser
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
