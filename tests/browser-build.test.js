import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createBrowserBundle } from '../scripts/browser-bundle.mjs';

const root = new URL('../', import.meta.url);

test('the downloaded index uses a classic script with no module imports', async () => {
  const index = await readFile(new URL('index.html', root), 'utf8');
  const bundle = await readFile(new URL('app.bundle.js', root), 'utf8');
  assert.match(index, /<script defer src="\.\/app\.bundle\.js"><\/script>/);
  assert.doesNotMatch(index, /type="module"/);
  assert.doesNotMatch(bundle, /^(?:import|export)\s/m);
  assert.equal(bundle, await createBrowserBundle(), 'Run npm run build to update app.bundle.js.');
});

test('Blockly is served locally without an algorithm-execution generator', async () => {
  const html = await readFile(new URL('index.html', root), 'utf8');
  assert.match(html, /src="\.\/vendor\/blockly\/blockly_compressed.js"/);
  assert.doesNotMatch(html, /src="https?:|javascript_compressed|eval\(/);
});
