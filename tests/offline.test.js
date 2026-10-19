import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { MessageChannel } from 'node:worker_threads';

const template = await readFile(new URL('../scripts/service-worker-template.js', import.meta.url), 'utf8');
function worker({ failInstall = false, online = false, httpError = false, clients = [] } = {}) {
  const scope = 'https://example.test/StructogramProgForADS/';
  const old = 'structogram:' + scope + ':old';
  const unrelated = 'structogram:https://example.test/other/:old';
  const cacheName = 'structogram:' + scope + ':test';
  const contents = new Map([[old, new Map()], [unrelated, new Map()]]);
  const handlers = {};
  let claimed = false, skipped = false, fetched = [];
  vm.runInNewContext(template.replace('__VERSION__', 'test').replace('__ASSETS__', JSON.stringify(['./index.html', './app.js'])), {
    URL, Response, MessageChannel, setTimeout, clearTimeout,
    Request: class { constructor(url) { this.url = new URL(url, scope).href; } },
    self: { registration: { scope }, addEventListener: (name, fn) => handlers[name] = fn, skipWaiting: async () => { skipped = true; }, clients: { claim: async () => { claimed = true; }, matchAll: async () => clients } },
    caches: {
      keys: async () => [...contents.keys()],
      delete: async key => contents.delete(key),
      open: async key => {
        if (!contents.has(key)) contents.set(key, new Map());
        const cache = contents.get(key);
        return {
          addAll: async urls => { if (failInstall) throw Error('offline'); for (const url of urls) cache.set(url.url, 'cached:./' + url.url.slice(scope.length)); },
          match: async request => cache.get((typeof request === 'string' ? request : request.url).split('?')[0])
        };
      }
    },
    fetch: async request => { fetched.push(request.url); if (!online) throw Error('offline'); return { ok: !httpError, text: 'fresh' }; }
  });
  return { scope, old, unrelated, cacheName, contents, fetched, get claimed() { return claimed; }, get skipped() { return skipped; },
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
  assert.equal(w.fetched.length, 3);
  assert.equal(w.skipped, true);
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

test('ordinary navigation and assets prefer the published version instead of the old snapshot', async () => {
  const w = worker({ online: true }); await w.lifecycle('install');
  assert.equal((await w.request('./')).text, 'fresh');
  assert.equal((await w.request('./app.js?v=new', 'cors')).text, 'fresh');
});
test('an unsuccessful server response uses the complete offline copy', async () => {
  const w = worker({ online: true, httpError: true }); await w.lifecycle('install');
  assert.equal(await w.request('./'), 'cached:./index.html');
  assert.equal(await w.request('./app.js?v=previous', 'cors'), 'cached:./app.js');
});

test('a current editor handles the save handshake without a forced navigation', async () => {
  let navigated = false, notified = false;
  const client = {
    url: 'https://example.test/StructogramProgForADS/',
    postMessage(message, ports) { notified = message.type === 'STRUCTOGRAM_UPDATE'; ports[0].postMessage({ handled: true }); ports[0].close(); },
    navigate() { navigated = true; }
  };
  const w = worker({ clients: [client] }); await w.lifecycle('install'); await w.lifecycle('activate');
  assert.equal(notified, true); assert.equal(navigated, false);
});
test('legacy pages navigate automatically and activation never waits on a page load', async () => {
  let navigated = false;
  const client = {
    url: 'https://example.test/StructogramProgForADS/',
    postMessage(message, ports) { ports[0].close(); },
    navigate() { navigated = true; return new Promise(() => {}); }
  };
  const w = worker({ clients: [client] }); await w.lifecycle('install'); await w.lifecycle('activate');
  assert.equal(navigated, true);
});
