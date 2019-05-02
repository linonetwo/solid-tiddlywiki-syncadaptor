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
    console.log('getTiddlerInfo', tiddler.fields.title);
    return {};
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
    console.log('login1');
    let session = await solidAuthClient.currentSession();
    const popupUri = 'https://solid.community/common/popup.html';
    if (!session) {
      session = await solidAuthClient.popupLogin({ popupUri });
      (session: SoLiDSession);
    }
    console.log('login2', session);
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
    console.log('getSkinnyTiddlers');
    // this will create a index for tiddlywiki on the POD if we don't have one
    // and return turtle files describing all tiddlers' metadata
    const indexTtlFiles = await this.getTWContainersOnPOD();

    const parser = new Parser({ format: 'Turtle' });
    const parsedRdfQuads = indexTtlFiles.map(ttlFile => parser.parse(ttlFile));
    const store = new Store();
    parsedRdfQuads.forEach(quads => store.addQuads(quads));
    const queryEngine = newEngine();
    const result = await queryEngine.query('SELECT * { ?s ?p ?o }', {
      sources: [{ type: 'rdfjsSource', value: store }],
    });
    result.bindingsStream.on('data', data => {
      console.log(data.get('?s').id, data.get('?p').id, data.get('?o').id);
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
  saveTiddler(
    tiddler: Tiddler,
    callback: (error?: Error, adaptorInfo: Object, revision: string) => void,
    // tiddlerInfo: Object,
  ) {
    // update file located at tiddler.fields.title
    console.log('saveTiddler', tiddler.fields.title, Object.keys(tiddler.fields), sha1(tiddler.fields));
    callback(undefined, {}, sha1(tiddler.fields));
  }

  /** Loads a tiddler from the server, with its text field
   * @param {string} title Title of tiddler to be retrieved
   * @param {(err,tiddlerFields) => void} callback See https://tiddlywiki.com/#TiddlerFields
   */
  loadTiddler(title: string, callback: (error?: Error, tiddlerFields: Tiddler) => void) {
    // console.log('loadTiddler', title);

    callback(undefined, {});
  }

  /** Delete a tiddler from the server.
   * @param {string} title Title of tiddler to be deleted
   * @param {Function} callback Callback function invoked with parameter err
   * @param {Object} tiddlerInfo The tiddlerInfo maintained by the syncer.getTiddlerInfo() for this tiddler
   */
  deleteTiddler(title: string, callback: (error?: Error) => void, tiddlerInfo: Object) {
    // delete file located at title, title itself is a path
    // console.log('deleteTiddler', title);
  }

  /** Scan index files, return the content, create if no exists */
  async getTWContainersOnPOD(): Promise<string[]> {
    const session: SoLiDSession | null = await solidAuthClient.currentSession();
    const currentWebIDString: ?string = session?.webId;
    const indexFilesString = this.wiki.getTiddlerText('$:/plugins/linonetwo/solid-tiddlywiki-syncadaptor/TWContainers');

    // guards
    if (!currentWebIDString) {
      throw new Error('SOLID000 getTWContainersOnPOD() get called without login, abort login()');
    }
    if (!indexFilesString) {
      throw new Error(
        'SOLID001 getTWContainersOnPOD() get called while Containers textarea is unfilled, abort login()',
      );
    }
    let currentWebIDURL;
    try {
      currentWebIDURL = new URL(currentWebIDString);
    } catch (error) {
      throw new Error(`SOLID002 getTWContainersOnPOD() receives bad WebID ${currentWebIDString}`);
    }

    const indexFiles: Array<string> = compact(indexFilesString.split('\n'));
    // currently Node Solid Server supports following root location
    if (
      !indexFiles.every(
        path =>
          path.startsWith('/public') ||
          path.startsWith('/private') ||
          path.startsWith('/inbox') ||
          path.startsWith('/profile'),
      )
    ) {
      throw new Error(
        `SOLID003 getTWContainersOnPOD() get called, but some Containers is invalid ${JSON.stringify(
          indexFiles,
          null,
          '  ',
        )}`,
      );
    }

    // try access files
    const podUrl = `${currentWebIDURL.protocol}//${currentWebIDURL.hostname}`;
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
          return SoLiDTiddlyWikiSyncAdaptor.createFileOrFolder(itemToCreate.uri, true);
        }),
    );

    return fileContents.filter(item => item.status === 200).map(item => item.text);
  }

  /**
   * Recursively create parent folder then the file itself
   * This function only creates turtle file ends with .ttl
   * Or folder ends without slash
   * @param {string} uri the file or folder uri to be created
   */
  static async createFileOrFolder(url: string, folder?: boolean = false) {
    // first check if folder exists, so we can put this file inside
    const urlObj = new URL(url);
    const pathName = urlObj.pathname;
    const hostName = urlObj.hostname;
    const fileOrFolderNameToCreate = basename(url, '.ttl');
    const parentFolder = dirname(pathName);
    const parentUrl = `https://${hostName}${parentFolder}`;
    if (parentFolder !== '/') {
      const parentFolderResponse: Response = await solidAuthClient.fetch(parentUrl);
      if (parentFolderResponse.status === 404) {
        await SoLiDTiddlyWikiSyncAdaptor.createFileOrFolder(parentUrl, true);
      }
    }
    // parent folder now exists, create the thing itself
    const link = folder
      ? '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"'
      : '<http://www.w3.org/ns/ldp#Resource>; rel="type"';
    const contentType = 'text/turtle';
    const init = {
      method: 'POST',
      headers: { slug: fileOrFolderNameToCreate, link, 'Content-Type': contentType },
      body: '',
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
