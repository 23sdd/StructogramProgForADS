const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron');
const { readFile, writeFile, stat } = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

app.setName('Structogram ADS');
let mainWindow;
const entryPath = path.join(__dirname, '..', 'dist', 'index.html');
const entryURL = pathToFileURL(entryPath).href;
const allowedExtensions = new Set(['ads', 'svg', 'png']);

function authorize(event) {
  if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame || event.senderFrame.url !== entryURL) {
    throw new Error('This action is available only inside the editor.');
  }
}

ipcMain.handle('file:save', async (event, payload) => {
  authorize(event);
  const extension = typeof payload?.name === 'string' ? path.extname(payload.name).slice(1) : '';
  if (!allowedExtensions.has(extension) || !(payload.bytes instanceof Uint8Array) || payload.bytes.byteLength > 32_000_000) throw new Error('Unsupported file.');
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save ' + extension.toUpperCase(),
    defaultPath: path.basename(payload.name),
    filters: [{ name: extension.toUpperCase() + ' file', extensions: [extension] }]
  });
  if (result.canceled || !result.filePath) return false;
  await writeFile(result.filePath, payload.bytes);
  return true;
});

ipcMain.handle('file:open', async event => {
  authorize(event);
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open algorithm', properties: ['openFile'],
    filters: [{ name: 'Algorithm source', extensions: ['ads', 'txt', 'str', 'json'] }]
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const file = result.filePaths[0];
  if ((await stat(file)).size > 400_000) throw new Error('Choose a source file smaller than 400 KB.');
  return { name: path.basename(file), text: await readFile(file, 'utf8') };
});

ipcMain.handle('document:print', async event => {
  authorize(event);
  return new Promise(resolve => mainWindow.webContents.print({ printBackground: true }, success => resolve(success)));
});

function menuAction(action) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('menu:action', action);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1380, height: 920, minWidth: 800, minHeight: 650,
    title: 'Structogram ADS', backgroundColor: '#f7f8f6', show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => { if (url !== entryURL) event.preventDefault(); });
  mainWindow.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.loadFile(entryPath);
  if (process.argv.includes('--smoke-test')) {
    const timer = setTimeout(() => { console.error('Desktop startup timed out'); app.exit(1); }, 30_000);
    mainWindow.webContents.once('did-finish-load', async () => {
      try {
        const ready = await mainWindow.webContents.executeJavaScript(`Boolean(window.structogramDesktop && document.querySelector('#diagram-stage svg') && document.querySelectorAll('#examples button').length === 6)`);
        if (!ready) throw new Error('Editor did not initialize inside the desktop window');
        await mainWindow.webContents.executeJavaScript(`document.querySelector('#source').value = 'algorithm()\\n  d := 4'; document.querySelector('#source').dispatchEvent(new Event('input'));`);
        await new Promise(resolve => setTimeout(resolve, 350));
        const rendered = await mainWindow.webContents.executeJavaScript(`document.querySelector('#diagram-stage').textContent.includes('d := 4') && document.querySelector('#parse-error').hidden`);
        if (!rendered) throw new Error('The desktop editor did not render the entered algorithm');
        console.log('Desktop smoke test passed: native bridge, six examples, and live diagram');
        clearTimeout(timer);
        app.exit(0);
      } catch (error) { console.error(error); clearTimeout(timer); app.exit(1); }
    });
  }
}

app.whenReady().then(() => {
  app.setAboutPanelOptions({ applicationName: 'Structogram ADS', applicationVersion: app.getVersion(), copyright: 'Independent ADS study tool' });
  const menus = [];
  if (process.platform === 'darwin') menus.push({ role: 'appMenu' });
  menus.push({ label: 'File', submenu: [
    { label: 'New Algorithm', accelerator: 'CmdOrCtrl+N', click: () => menuAction('new') },
    { label: 'Open…', accelerator: 'CmdOrCtrl+O', click: () => menuAction('open') },
    { label: 'Save Source As…', accelerator: 'CmdOrCtrl+S', click: () => menuAction('save') },
    { type: 'separator' },
    { label: 'Print / PDF…', accelerator: 'CmdOrCtrl+P', click: () => menuAction('print') },
    { type: 'separator' }, { role: 'close' }
  ] });
  menus.push({ role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' }, { role: 'help', submenu: [
    { label: 'Syntax & Notation', click: () => menuAction('guide') }
  ] });
  Menu.setApplicationMenu(Menu.buildFromTemplate(menus));
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
