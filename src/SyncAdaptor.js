// @flow

class SoLiDTiddlyWikiSyncAdaptor {
  wiki: Wiki;

  constructor(options: { wiki: Wiki }) {
    this.wiki = options.wiki;
    // console.log('constructor');
  }

  /**
   * Gets the supplemental information that the adaptor needs to keep track of for a particular tiddler. For example, the TiddlyWeb adaptor includes a bag field indicating the original bag of the tiddler.
   * Executed after constructor()
   * @param tiddler Target tiddler
   */
  getTiddlerInfo(tiddler: Tiddler) {
    // console.log('getTiddlerInfo', tiddler.fields.title);

    return {};
  }

  /**
   * Retrieves status information from the server. This method is optional.
   * Executed after getTiddlerInfo()
   * @param {(err,isLoggedIn,username) => void} callback
   */
  getStatus(callback: (error?: Error, isLoggedIn: boolean, username?: string) => void) {
    // try access index file, if no then create one. This operation's success means login's success
    // console.log('getStatus');
  }

  /** Attempts to login to the server with specified credentials. This method is optional. */
  login(username: string, password: string, callback: Function) {
    // console.log('login');
  }

  /** Attempts to logout of the server. This method is optional. */
  logout(callback: Function) {
    // console.log('logout');
  }

  /**
   * Retrieves a list of skinny tiddlers from the server.
   * This method is optional. If an adaptor doesn't implement it then synchronisation will be unidirectional from the TiddlyWiki store to the adaptor, but not the other way.
   * get called here https://github.com/Jermolene/TiddlyWiki5/blob/07198b9cda12da82fc66dcf0589d6a9caab1cdf6/core/modules/syncer.js#L208
   */
  getSkinnyTiddlers(callback: (error?: Error, tiddlers: Tiddler[]) => void) {
    // console.log('getSkinnyTiddlers');

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
    tiddlerInfo: Object,
  ) {
    // update file located at tiddler.fields.title
    // console.log('saveTiddler', tiddler.fields.title, Object.keys(tiddler.fields));
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
