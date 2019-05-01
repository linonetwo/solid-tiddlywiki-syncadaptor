/* \
title: $:/plugins/linonetwo/solid-tiddlywiki-syncadaptor/SyncAdaptor.js
type: application/javascript
module-type: syncadaptor
\ */
// @flow

type TiddlerFields = {
  /** The unique name of a tiddler */
  title: string,
  /** The body text of a tiddler */
  text: string,
  /**	The date and time at which a tiddler was last modified */
  modified: Date,
  /**	The tiddler title associated with the person who last modified a tiddler */
  modifier: string,
  /** The date a tiddler was created */
  created: Date,
  /**	The name of the person who created a tiddler */
  creator: string,
  /**	A list of tags associated with a tiddler */
  tags: string[],
  /**	The content type of a tiddler */
  type: string,
  /**	An ordered list of tiddler titles associated with a tiddler */
  list: string[],
  /**	The text to be displayed on a tab or button */
  caption: string,
};

class SoLiDTiddlyWikiSyncAdaptor {
  constructor(options) {
    // init param
    this.wiki = options.wiki;
    this.localStorage = localStorage;

    this._index = null;
    this._syncedSkinny = null;

    // init widget
    const widget = new Widget(this.fileClient, {
      leaveOpen: false,
      autoCloseAfter: 4000,
      windowReload: false,
      solidAppName: 'tiddlywiki',
      appFolder: '/public/tiddlers',
    });

    widget.attach();

    const style = document.createElement('style');
    style.innerHTML = `#remotestorage-widget {
        position: fixed;
        top: 18px;
        right: 15px;
    }`;
    document.head.appendChild(style);

    // init wiki tiddlers parameters
    const ns = this.getTiddlerText(NAMESPACE_KEY) || this.localStorage.getItem(NAMESPACE_KEY) || 'main';
    this.localStorage.setItem(NAMESPACE_KEY, ns);
    this.wiki.setText(NAMESPACE_KEY, null, null, ns);

    alert(
      `You can work on different tiddlywiki's on your pod.\nOne at a time. Default 'wiki folder is 'main'.\nTo change go to 'Options', 'saving', 'nodesolidserver syncadaptor'\nBeware : Reload or disconnect after a change\n\nYou are actually linked to : ${ 
        this.getTiddlerText(NAMESPACE_KEY)}`,
    );

    const priv = this.getTiddlerText(PRIVATENESS_KEY) || this.localStorage.getItem(PRIVATENESS_KEY) || 'no';
    this.localStorage.setItem(PRIVATENESS_KEY, priv);
    this.wiki.setText(PRIVATENESS_KEY, null, null, priv);
  }

  /**
   * Gets the supplemental information that the adaptor needs to keep track of for a particular tiddler. For example, the TiddlyWeb adaptor includes a bag field indicating the original bag of the tiddler.
   * @param tiddler Target tiddler
   */
  getTiddlerInfo(tiddler) {
    return {};
  }

  /**
   * Retrieves status information from the server
   * @param {(err,isLoggedIn,username) => void} callback
   */
  getStatus(callback) {
    this.checkFileSystem = true;
    this.fileClient
      .checkSession()
      .then(session => {
        if (localStorage.getItem('appRootUri') == null) {
          this.fileClient.logout().then(
            success => {
              //				window.location.reload(true); //firefox;
              this.connected = false;
              this.wiki.setText('$:/status/IsLoggedIn', null, null, 'no');
              callback(null, 'no');
            },
            err => {
              this.connected = false;
              this.wiki.setText('$:/status/IsLoggedIn', null, null, 'no');
              callback(null, 'no');
            },
          );
        } else {
          this.uri = `${localStorage.getItem('appRootUri')  }/${  this.getTiddlerText(NAMESPACE_KEY, 'main')}`;
          this.sessionWebId = session.webId;
          this.connected = true;
        }
      })
      .catch(err => {
        this.connected = false;
        this.checkFileSystem = false;
        this.wiki.setText('$:/status/IsLoggedIn', null, null, 'no');
        callback(null, 'no');
      })
      // checkFileSystem()
      .then(() => {
        if (this.connected) {
          return this.fileClient.readFolder(this.uri).then(
            folder => {}, // this.count = this.count +1; alert("count "+this.count)}
            err => {
              return this.fileClient.createFolder(this.uri).then(folder => {}); // this.count = this.count +1; alert("count "+this.count)})
            },
          );
        }
      })
      .then(() => {
        if (this.connected) {
          return this.fileClient.readFile(`${this.uri  }/__index__.json`).then(
            body => {
              this.checkFileSystem = false;
            },
            err => {
              return this.fileClient.createFile(`${this.uri  }/__index__.json`, JSON.stringify({})).then(body => {
                this.checkFileSystem = false;
              }); // this.count = this.count +1; alert("count "+this.count);this.checkFileSystem = false})
            },
          );
        }
      })
      .then(() => {
        if (this.connected && this.checkFileSystem === false) {
          this.wiki.setText('$:/status/IsLoggedIn', null, null, 'yes');
          callback(null, 'yes', this.sessionWebId.split('/')[2].split('.')[0]);
        }
      })
      .catch(err => {
        if (this.checkFileSystem === true) {
          alert(`Cannot create the app filesystem :\n${  err}`);
        } else {
          alert(`unknown error : ${  err}`);
        }
      });
  }

  /** Attempts to login to the server with specified credentials. This method is optional. */
  login(username, password, callback) {}

  /** Attempts to logout of the server. This method is optional. */
  logout(callback) {}

  /**
   * Retrieves a list of skinny tiddlers from the server.
   * This method is optional. If an adaptor doesn't implement it then synchronisation will be unidirectional from the TiddlyWiki store to the adaptor, but not the other way.
   * @param {(err, tiddlers: Array<TiddlerFieldObjects>) => void} callback
   */
  getSkinnyTiddlers(callback) {
    if (this.connected == false && localStorage.getItem('appRootUri') != null) {
      this._index = null;
      this._syncedSkinny = null;
      this.connected = true;
    }
    if (this.connected == true && localStorage.getItem('appRootUri') == null) {
      window.location.reload(true);
    }
    this.getIndex()
      .then(index => {
        if (typeof index === 'undefined' || localStorage.getItem('appRootUri') == null) {
          const tiddlers = {};
          callback(null, tiddlers);
          return true;
        }
        if (this._syncedSkinny != true) {
          alert(
            "'synced with Pod'\n\n - click on + to create a tidller\n - click on <more> then <tags> to find your tiddlers\n  (including untagged ones)",
          );
        }
        this._syncedSkinny = true;
        const tiddlers = Object.keys(index).map(title => Object.assign({ title }, index[title]));
        tiddlers.push({ title: NAMESPACE_KEY });
        tiddlers.push({ title: PRIVATENESS_KEY });
        //        if (!this.readonly) tiddlers.push({title: '$:/StoryList'})

        callback(null, tiddlers);
      })
      .catch(e => {
        this._syncedSkinny = false;
        //		alert("11. e : "+e+"\this.count "+this.count);
        //		window.location.reload(true);
        //        callback(e)
      });
    return true;
  }

  /** Saves a tiddler to the server.
   * @param {(err,adaptorInfo,revision) => void} callback
   * @param {Object} tiddlerInfo The tiddlerInfo maintained by the syncer.getTiddlerInfo() for this tiddler
   */
  saveTiddler(tiddler, callback, tiddlerInfo) {
    if (
      tiddler.fields.title.slice(0, 36) === '$:/plugins/bourgeoa/nodesolidserver/' ||
      tiddler.fields.title === '$:/StoryList'
    ) {
      this.localStorage.setItem(tiddler.fields.title, JSON.stringify(tiddler.fields));
      // whenever this happens we must reload our index
      if (tiddler.fields.title.split('/')[3] === 'nodesolidserver') {
        this._index = null;
      }
      callback(null);
      return;
    }
    this.getIndex().then(index => {
      const skinny = Object.assign({}, tiddler.fields);
      delete skinny.text;
      delete skinny.title;
      index[tiddler.fields.title] = skinny;
    });
    this.fileClient
      .updateFile(
        `${this.getClient()  }/${  encodeURIComponent(tiddler.fields.title)  }.json`,
        JSON.stringify(tiddler.fields),
      )
      .then(
        success => {
          this.saveIndex();
          callback(null);
          
        },
        err => {
          alert(`Error saved tiddler : ${  err}`);
        },
      );
    return true;
  }

  /** Loads a tiddler from the server.
   * @param {string} title Title of tiddler to be retrieved
   * @param {(err,tiddlerFields) => void} callback See https://tiddlywiki.com/#TiddlerFields
   */
  loadTiddler(title, callback) {
    callback(null, {});
  }

  /** Delete a tiddler from the server.
   * @param {string} title Title of tiddler to be deleted
   * @param {Function} callback Callback function invoked with parameter err
   * @param {Object} tiddlerInfo The tiddlerInfo maintained by the syncer.getTiddlerInfo() for this tiddler
   */
  deleteTiddler(title, callback, tiddlerInfo) {
    if (this.readonly) return callback(null);

    if (title.slice(0, 36) === '$:/plugins/bourgeoa/nodesolidserver/' || title === '$:/StoryList') {
      this.localStorage.removeItem(title);
    }

    this.getIndex().then(index => {
      delete index[title];
      this.fileClient.deleteFile(`${this.getClient()  }/${  encodeURIComponent(title)  }.json`).then(
        success => {
          this.saveIndex();
          callback(null);
        },
        err => alert(`deleteTiddler : ${  err}`),
      );
    });
    return true;
  }

  getTiddlerText(title, deft) {
    const tiddler = this.wiki.getTiddlerText(title);
    let text;
    try {
      text = JSON.parse(tiddler).text;
    } catch (e) {
      text = tiddler;
    }
    return text || deft;
  }

  getClient() {
    const ns = this.getTiddlerText(NAMESPACE_KEY, 'main');
    const priv = this.getTiddlerText(PRIVATENESS_KEY, 'no');
    if (localStorage.getItem('appRootUri') == null) {
      return;
    }
    const baseUri = `${localStorage.getItem('appRootUri')  }/${  ns}`;
    return baseUri;
  }

  getIndex() {
    if (this._index !== null) {
      return Promise.resolve(this._index);
    }
    return this.fileClient.readFile(`${this.getClient()  }/__index__.json`).then(
      body => {
        const index = JSON.parse(body) || JSON.parse('{}');
        this._index = index;
        return Promise.resolve(index);
      },
      err => {
        alert(`this.getClient() ${  this.getClient()  }\nbody erreur ${  body}`);
      },
    );
  }

  saveIndex() {
    return this.getIndex().then(index => {
      this.fileClient.updateFile(`${this.getClient()  }/__index__.json`, JSON.stringify(index)).then(
        success => console.log(`saved Index :${  JSON.stringify(index)}`),
        err => {
          alert(`Index not saved :${  JSON.stringify(index)}`);
        },
      );
    });
  }
}

function parseTiddlerDates(fields) {
  fields.created = fields.created && new Date(Date.parse(fields.created));
  fields.modified = fields.modified && new Date(Date.parse(fields.modified));
  return fields;
}

// if ($tw && $tw.browser) {
  /** The JavaScript class for the adaptor */
  exports.adaptorClass = SoLiDTiddlyWikiSyncAdaptor;
// }
