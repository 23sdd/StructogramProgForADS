import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const template = await readFile(new URL('../scripts/service-worker-template.js', import.meta.url), 'utf8');
function worker({ failInstall = false } = {}) {
  const scope = 'https://example.test/StructogramProgForADS/';
  const old = 'structogram:' + scope + ':old';
  const unrelated = 'structogram:https://example.test/other/:old';
  const cacheName = 'structogram:' + scope + ':test';
  const contents = new Map([[old, new Map()], [unrelated, new Map()]]);
  const handlers = {};
  let claimed = false, fetched = [];
  vm.runInNewContext(template.replace('__VERSION__', 'test').replace('__ASSETS__', JSON.stringify(['./index.html', './app.js'])), {
    URL,
    self: { registration: { scope }, addEventListener: (name, fn) => handlers[name] = fn, clients: { claim: async () => { claimed = true; } } },
    caches: {
      keys: async () => [...contents.keys()],
      delete: async key => contents.delete(key),
      open: async key => {
        if (!contents.has(key)) contents.set(key, new Map());
        const cache = contents.get(key);
        return {
          addAll: async urls => { if (failInstall) throw Error('offline'); for (const url of urls) cache.set(new URL(url, scope).href, 'cached:' + url); },
          match: async request => cache.get(typeof request === 'string' ? request : request.url)
        };
      }
    },
    fetch: async request => { fetched.push(request.url); return 'network'; }
  });
  return { scope, old, unrelated, cacheName, contents, fetched, get claimed() { return claimed; },
    lifecycle: name => { let result; handlers[name]({ waitUntil: promise => result = promise }); return result; },
    request: (path, mode = 'navigate', method = 'GET') => {
      let result;
      handlers.fetch({ request: { url: new URL(path, scope).href, method, mode }, respondWith: promise => result = promise });
      return result;
    }
  };
}
test('offline snapshot serves project-root navigation, index and assets without network', async () => {
  const w = worker(); await w.lifecycle('install'); await w.lifecycle('activate');
  assert.equal(await w.request('./?launch=app'), 'cached:./index.html');
  assert.equal(await w.request('./index.html'), 'cached:./index.html');
  assert.equal(await w.request('./app.js', 'cors'), 'cached:./app.js');
  assert.deepEqual(w.fetched, []);
  assert.equal(w.claimed, true);
});
test('activation removes only this project’s old cache; unrelated sites and non-GETs are untouched', async () => {
  const w = worker(); await w.lifecycle('install'); await w.lifecycle('activate');
  assert.equal(w.contents.has(w.old), false);
  assert.equal(w.contents.has(w.unrelated), true);
  assert.equal(w.request('https://other.test/'), undefined);
  assert.equal(w.request('./', 'cors', 'POST'), undefined);
});
test('failed precache preserves the previous release and does not activate a partial snapshot', async () => {
  const w = worker({ failInstall: true });
  await assert.rejects(w.lifecycle('install'), /offline/);
  assert.equal(w.contents.has(w.cacheName), false);
  assert.equal(w.contents.has(w.old), true);
  assert.equal(w.claimed, false);
});
