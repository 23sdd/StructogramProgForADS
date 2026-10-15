import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { createBrowserBundle, createStandalone } from './browser-bundle.mjs';

const root = new URL('../', import.meta.url);
const output = new URL('dist/', root);
const bundle = await createBrowserBundle();
const standalone = await createStandalone(bundle);
// Track ready-to-open files so GitHub's Download ZIP needs no build step.
await writeFile(new URL('app.bundle.js', root), bundle);
await writeFile(new URL('Structogram.html', root), standalone);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const item of ['index.html', 'styles.css', 'assets', 'src', 'app.bundle.js', 'Structogram.html']) {
  await cp(new URL(item, root), new URL(item, output), { recursive: true });
}

console.log('Updated ready-to-open files and built static editor in dist/');
