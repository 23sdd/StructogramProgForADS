import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { createBrowserBundle } from './browser-bundle.mjs';

const root = new URL('../', import.meta.url);
const output = new URL('dist/', root);
const bundle = await createBrowserBundle();
// Keep the generated application code synchronized with its small source modules.
await writeFile(new URL('app.bundle.js', root), bundle);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const item of ['index.html', 'styles.css', 'assets', 'src', 'app.bundle.js']) {
  await cp(new URL(item, root), new URL(item, output), { recursive: true });
}
const vendor = new URL('vendor/blockly/', output);
await mkdir(vendor, { recursive: true });
for (const item of ['blockly_compressed.js', 'LICENSE', 'media']) {
  await cp(new URL(`node_modules/blockly/${item}`, root), new URL(item, vendor), { recursive: true });
}
await cp(new URL('node_modules/blockly/msg/en.js', root), new URL('en.js', vendor));
await cp(new URL('THIRD_PARTY_NOTICES.md', root), new URL('THIRD_PARTY_NOTICES.md', output));

console.log('Built the desktop editor and its local Blockly assets in dist/');
