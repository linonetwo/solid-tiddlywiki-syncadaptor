const { existsSync, readFileSync, writeFileSync } = require('fs');

const defaultTiddlers = `
created: 20190501091923756
modified: 20190501092017911
title: $:/DefaultTiddlers
type: text/vnd.tiddlywiki

$:/plugins/linonetwo/solid-tiddlywiki-syncadaptor/about
GettingStarted
`;
const tiddlywikiTiddlersPath = 'demo-wiki/tiddlers';
if (existsSync(tiddlywikiTiddlersPath)) {
  writeFileSync(`${tiddlywikiTiddlersPath}/$__DefaultTiddlers.tid`, defaultTiddlers);
}
