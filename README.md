# solid-tiddlywiki-syncadaptor

Another attempt to make tiddlywiki a frontend for SoLiD Server.

## What this project does

[TiddlyWiki](http://tiddlywiki.com/) is a programmable notebook with lots of plugins and potential (for example [becomes Jupyter notebook's alternative](https://github.com/Jermolene/TiddlyWiki5/pull/3461)).

[SoLiD](https://solid.mit.edu/) is a proposed set of conventions and tools for building decentralized social applications based on Linked Data principles.

SoLiD POD (Person Owned Data) is a great place to store TiddlyWiki Tiddlers (executable Note with metadata). By using this [SyncAdaptor](https://tiddlywiki.com/dev/#Syncadaptor), you can sync TiddlyWiki data between mobile phone and computer, enable partial wiki sharing (sharing only a part of your wiki), collaborating (by allowing your friends write to your SoLiD POD).

## Files stored on the POD

Only user modified tiddlers will be synced to the SoLiD POD, likes `$:/StoryList` and other user created tiddlers.

### Data structure

This sync adapter will create some folders (containers) to store your tiddlers, each container is actually a web page with RDF inside, representing an array of `SkinnyTiddlers` (`SkinnyTiddlers` is used by [SyncAdaptor](https://tiddlywiki.com/dev/#Syncadaptor), describing what tiddlers you have in the backend, with all metadata of those tiddlers, without text of those tiddlers).

Files inside folders contains the `text` field of tiddlers.

### Please set a location to store tiddler before you login

Containers can located at `/public/tiddlywiki/main` for example, you must set at least one location in `$:/ControlPanel/Saving`'s `SoLiD SyncAdaptor` tab's TWContainers field, before you can login in the `$:/ControlPanel/Saving`.

you can add more than one index files in the `$:/ControlPanel/Saving`, each in a new line, for example, add a `/private/tiddlywiki/main` and a `/private/tiddlywiki/shareWithGirlFriend`, so it will be:

```config
/public/tiddlywiki/main
/private/tiddlywiki/main
/private/tiddlywiki/shareWithGirlFriend
```

Note that this config field is located in `$:/plugins/linonetwo/solid-tiddlywiki-syncadaptor/TWContainers` and will also be sync to your POD, it's better to set this file public for convenience.

### If you can not access private resources

See [github.com/solid/node-solid-server#upgrading-from-version-4](https://github.com/solid/node-solid-server#upgrading-from-version-4)

> starting from version 5, third-party apps are untrusted by default. To trust a third-party app, before you can log in to it, you first need to go to your profile at example.com/profile/card#me (important to include the ‘#me’ there), and then hover over the ‘card’ header to reveal the context menu. From there, select the ‘A’ symbol to go to your trusted applications pane, where you can whitelist third-party apps before using them. See also solid/node-solid-server/issues/1142 about streamlining this UX flow.

> You should trust `http://localhost:8080`, not `http://localhost:8080/`.

![trust app in solid config](https://raw.githubusercontent.com/linonetwo/solid-tiddlywiki-syncadaptor/master/docs/img/trusted%20apps.png)

## Syncing

### StoryList

StoryList is the ordering of main page tiddlers, if you check the `UseServerStoryList` checkbox in the config, then on startup, tiddler wiki will load StoryList from the server, restore previous session.

![UML of StoryList loading](https://raw.githubusercontent.com/linonetwo/solid-tiddlywiki-syncadaptor/master/docs/diagrams/useServerSideStoryList.png)

## More Feature

### Readonly POD

We can specific a POD to load tiddlers, even wiki user may visit without write permission. In this way, we can let TiddlyWiki be a public blog. Visitors can open your site, and read things in you public POD.

### SWR PreFetch Content

`stale-while-revalidate` is a cache invalidation strategy popularized by [HTTP RFC 5861](https://tools.ietf.org/html/rfc5861).

We only load the metadata of all tiddlers (metadata are also called "skinnytiddlers") at the startup. We then fetch content of all tiddlers from new to old, if "pre-cashing" option is opened in the config.

This pre-fetching will progressively download content using a queue. It will do it quick for the first time, but slower for subsequent fetching.

## Todo

### Share with certain friends

SoLiD have `/public` and `/inbox` (or `/private`), file on `/inbox` folder (which is a private container) is invisible to anyone not in your Web Access Control List, normally this ACL file is located in `/private/tiddlywiki/.acl` (?), if you choose to place some your tiddlers inside `/private/tiddlywiki`. You can change this ACL file using SoLiD's data browser web page, or using other SoLiD Apps, to share some tiddler with limited friends.

### Set a tiddler private

You can set a tiddler belongs to a container use `solid-sync` tiddler field, for example, `solid-sync: /private/tiddlywiki/main`. If this tiddler field is unset, this sync adaptor will assign one for it, by default the first one in the `$:/ControlPanel/Saving`'s TWContainers field.

`solid-sync` field accepts string or **array**, so you can assign a tiddler to more than one container, for example one container for draft, one container for publish.

### Local RDF translate

Currently, we translate tiddlywiki metadata from JSON to JSON-LD using a context at the beginning of `SyncAdaptor.js`, and translate JSON-LD to Turtle (n3) using `rdf-translator` npm package, which will send POST request to a web service of [alexstolz/rdf-translator](https://bitbucket.org/alexstolz/rdf-translator) which is written in python, which make it unable to work on local mode (save to a localhost SoLiD POD without internet access).

We can use rdflib to translate RDF, after [its issue](https://github.com/linkeddata/rdflib.js/issues/364) is solved.

### Speed up loading

Currently, `loadSkinnyTiddlers()` will load tons of metadata file at the start up, which is resource consuming.

![loadSkinnyTiddlers loading metadata files from SoLiD POD](https://raw.githubusercontent.com/linonetwo/solid-tiddlywiki-syncadaptor/master/docs/diagrams/getSkinnyTiddlers.png)

We might use a corn job to group all metadata file into a single file, so the loading will speed up.

Or we can use a single metadata file, and use PATCH to update it in small grain.

Or we can [ask Node SoLiD Server to support HTTP2](https://github.com/solid/node-solid-server/issues/1379).

### Full text search on SoLiD POD is currently impossible, and is [hard on TW](https://github.com/rsc/tiddly/issues/3)

### Collaborating should consider diff and conflict

I think a simple way to prevent conflict is letting people working on several different tiddlers, and transclude them together.

To prevent people editing same file, maybe you can use webrtc or libp2p to indicate a tiddler is currently being editing, thus prevent people from change it. Just like how Quip lock a line.

### I18N

https://groups.google.com/forum/#!topic/tiddlywikidev/9prY0BRCoGo

## Development

### `npm run start`

Will init a local tiddler wiki and copy all tiddlers to the `plugins` folder inside that wiki, and compile JS code, copy JS bundle to the `plugins` folder.

### `npm run dev`

Will compile JS and copy JS bundle to the `plugins` folder, on you save the JS file. A reload of wiki server will be performed to serve the new JS bundle.

### Local SoLiD Server

Install `mkcert` first, then use `npm run generate-keys` to generate key that SoLiD server needs for https. It will add `tiddlywiki.localhost` to the key chain, so you need to register a WebID with name `tiddlywiki`.

Run `npm run start:solid` to start a local test server, you can register WebID here: [https://localhost:8443](https://localhost:8443)

Then add `127.0.0.1    tiddlywiki.localhost` to `/etc/hosts`, other wise you will not be able to open [https://tiddlywiki.localhost:8443](https://tiddlywiki.localhost:8443).

Finally, you can put your localhost WebID `https://tiddlywiki.localhost:8443` after click the syncAdaptor config login button.

### References

#### Comunica

[how to use comunica bindingsStream](https://github.com/comunica/comunica/issues/445)

#### TiddlyWiki

Some APIs are in [tiddlywiki.com](https://tiddlywiki.com/) and some are in [tiddlywiki.com/dev/](https://tiddlywiki.com/dev/). For example, [SyncAdaptorModules](https://tiddlywiki.com/dev/#SyncAdaptorModules:SyncAdaptorModules%20Syncadaptor%20Saver).

General discussions are in [tiddlywiki google groups](https://groups.google.com/forum/#!forum/tiddlywiki) and [discord](https://discord.gg/tYzK9eC).

Advanced topics can be asked in [tiddlywiki dev google groups](https://groups.google.com/forum/#!forum/tiddlywikidev).

#### Other SyncAdaptor

[TiddlyWebAdaptor](https://github.com/Jermolene/TiddlyWiki5/blob/c05c0d3df66e587f35c5cd3eedcac432b1eed012/plugins/tiddlywiki/tiddlyweb/tiddlywebadaptor.js)

[syncer.js that calls this SyncAdaptor](https://github.com/Jermolene/TiddlyWiki5/blob/master/core/modules/syncer.js)

[possible custom data from SyncAdaptor](https://github.com/Jermolene/TiddlyWiki5/issues/3938)

#### File manipulation on SoLiD POD

[jeff-zucker/solid-file-client/blob/master/src/index.js](https://github.com/jeff-zucker/solid-file-client/blob/master/src/index.js)

#### SoLiD Design Style Guide from Inrupt

[design.inrupt.com](https://design.inrupt.com/atomic-core/)

## Acknowledgements

I've learnt the code of [bourgeoa's tiddlywiki-node-solid-server](https://github.com/bourgeoa/tiddlywiki-node-solid-server)
