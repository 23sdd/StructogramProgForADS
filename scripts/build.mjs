import { createHash } from 'node:crypto';
import { cp, mkdir, rm, writeFile, readFile, readdir } from 'node:fs/promises';
import { createBrowserBundle, createStructuresBundle } from './browser-bundle.mjs';

const root = new URL('../', import.meta.url);
const output = new URL('dist/', root);
const bundle = await createBrowserBundle();
// Keep the generated application code synchronized with its small source modules.
await writeFile(new URL('app.bundle.js', root), bundle);
await writeFile(new URL('structures.bundle.js', root), await createStructuresBundle());
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const item of ['index.html', 'styles.css', 'assets', 'app.bundle.js', 'manifest.webmanifest', 'pwa.js', 'structures.html', 'structures.css', 'structures.bundle.js', 'execution.css']) {
  await cp(new URL(item, root), new URL(item, output), { recursive: true });
}
const vendor = new URL('vendor/blockly/', output);
await mkdir(vendor, { recursive: true });
for (const item of ['blockly_compressed.js', 'LICENSE', 'media']) {
  await cp(new URL(`node_modules/blockly/${item}`, root), new URL(item, vendor), { recursive: true });
}
await cp(new URL('node_modules/blockly/msg/en.js', root), new URL('en.js', vendor));
await cp(new URL('THIRD_PARTY_NOTICES.md', root), new URL('THIRD_PARTY_NOTICES.md', output));

// Hash every deployed resource so each release has an atomic offline snapshot.
async function filesIn(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const name = prefix + entry.name;
    if (entry.isDirectory()) files.push(...await filesIn(new URL(entry.name + '/', directory), name + '/'));
    else files.push(name);
  }
  return files.sort();
}
const assets = await filesIn(output);
const hash = createHash('sha256');
for (const name of assets) { hash.update(name); hash.update(await readFile(new URL(name, output))); }
const template = await readFile(new URL('scripts/service-worker-template.js', root), 'utf8');
hash.update(template);
const revision = hash.digest('hex').slice(0, 20);
for (const name of ['index.html', 'structures.html']) {
  const html = await readFile(new URL(name, output), 'utf8');
  await writeFile(new URL(name, output), html.replace('<title>', `<meta name="app-version" content="${revision}"><title>`).replace(/((?:src|href)="\.\/[^"]+\.(?:js|css))"/g, `$1?v=${revision}"`));
}
await writeFile(new URL('sw.js', output), template.replace('__VERSION__', revision).replace('__ASSETS__', JSON.stringify(assets.map(name => './' + name))));
await writeFile(new URL('.nojekyll', output), '');
console.log('Built the browser editor with local Blockly assets and offline cache in dist/');
