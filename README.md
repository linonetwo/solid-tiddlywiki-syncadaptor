# solid-tiddlywiki-syncadaptor

Another attempt to make tiddlywiki a frontend for SoLiD Server.

## Files stored on the POD

Only user modified tiddlers will be synced to the SoLiD POD, likes `$:/StoryList` and other user created tiddlers.

### Privacy

SoLiD have `/public` and `/private`, this sync adapter will create two index, each contains an array of `SkinnyTiddlers` (`SkinnyTiddlers` is used by [Syncadaptor](https://tiddlywiki.com/dev/#Syncadaptor), describing what tiddlers you have).

Index files are stored in the `/public/tiddlywiki/main/index.ttl` for example, you must input at least one location into the field inside `$:/ControlPanel/Saving`'s `SoLiD SyncAdaptor` tab's IndexFiles field, before you can login in the `$:/ControlPanel/Saving`.

you can add more than one index files in the `$:/ControlPanel/Saving`, each in a new line, for example, add a `/private/tiddlywiki/main/index.ttl` and a `/private/tiddlywiki/main/shareWithGirlFriend.ttl`, so it will be:

```config
/public/tiddlywiki/main/index.ttl
/private/tiddlywiki/main/index.ttl
/private/tiddlywiki/main/shareWithGirlFriend.ttl
```

#### Share with certain friends

Index file on `/private` folder is invisible to anyone not in your Web Access Control List File, normally this ACL file is located in `/private/tiddlywiki/main/index.ttl.acl` (?). You can change it using other SoLiD Apps.

#### Set a tiddler private

You can set a tiddler belongs to an index file use `solid-index-file` tiddler field, for example, `solid-index-file: /private/tiddlywiki/main/index.ttl`. If this tiddler field is unset, this sync adaptor will assign the first one in the `$:/ControlPanel/Saving`'s IndexFiles field to it.

## Todo

Full text search on SoLiD POD is currently impossible, and is [hard on TW](https://github.com/rsc/tiddly/issues/3).

## Acknowledgements

I've learnt the code of [bourgeoa's tiddlywiki-node-solid-server](https://github.com/bourgeoa/tiddlywiki-node-solid-server)
