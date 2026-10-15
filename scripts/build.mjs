import { cp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const output = new URL('dist/', root);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const item of ['index.html', 'styles.css', 'assets', 'src']) {
  await cp(new URL(item, root), new URL(item, output), { recursive: true });
}

// Also provide a single-file release that can be opened without a server.
const modules = ['parser', 'renderer', 'examples', 'app'];
const script = (await Promise.all(modules.map(async name => {
  const content = await readFile(new URL(`src/${name}.js`, root), 'utf8');
  return content.replace(/^import .+;\n/gm, '').replace(/^export /gm, '');
}))).join('\n').replace(/<\/script/gi, '<\\/script');
const css = await readFile(new URL('styles.css', root), 'utf8');
const icon = (await readFile(new URL('assets/favicon.svg', root))).toString('base64');
const html = (await readFile(new URL('index.html', root), 'utf8'))
  .replace('<link rel="stylesheet" href="./styles.css">', () => `<style>${css}</style>`)
  .replace('<script type="module" src="./src/app.js"></script>', () => `<script type="module">${script}</script>`)
  .replace('href="./assets/favicon.svg"', () => `href="data:image/svg+xml;base64,${icon}"`)
  .replace('href="./"', 'href="#"');
await writeFile(new URL('Structogram.html', output), html);
console.log('Built static editor and standalone Structogram.html in dist/');
