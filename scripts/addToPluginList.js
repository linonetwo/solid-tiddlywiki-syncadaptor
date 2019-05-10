/* eslint-env node */
const { existsSync, readFileSync, writeFileSync } = require('fs');

const tiddlywikiInfoPath = 'demo-wiki/tiddlywiki.info';
if (existsSync(tiddlywikiInfoPath)) {
  const configFile = readFileSync(tiddlywikiInfoPath);
  const config = JSON.parse(configFile);
  config.plugins.push('solid-tiddlywiki-syncadaptor');
  writeFileSync(tiddlywikiInfoPath, JSON.stringify(config, null, '  '));
}
