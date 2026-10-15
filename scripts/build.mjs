import { cp, mkdir, rm } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const output = new URL('dist/', root);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const item of ['index.html', 'styles.css', 'assets', 'src']) {
  await cp(new URL(item, root), new URL(item, output), { recursive: true });
}
console.log('Built static editor in dist/');
