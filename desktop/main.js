'use strict';
const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { ModbusTCP } = require('./modbus');
const updater = require('./updater');
const BACKGROUND = process.argv.includes('--background-update');

let win = null;
const mb = new ModbusTCP();
const FILTERS = {
  sxp: [{ name: 'Projet Simulix', extensions: ['sxp'] }, { name: 'JSON', extensions: ['json'] }],
  csv: [{ name: 'CSV (Excel)', extensions: ['csv'] }],
  ino: [{ name: 'Croquis Arduino', extensions: ['ino'] }],
  png: [{ name: 'Image PNG', extensions: ['png'] }],
  pdf: [{ name: 'Document PDF', extensions: ['pdf'] }]
};

function fileArg(argv) { return argv.slice(1).find(a => /\.(sxp|json)$/i.test(a) && fs.existsSync(a)); }

function createWindow() {
  win = new BrowserWindow({
    width: 1500, height: 920, minWidth: 900, minHeight: 600, title: 'Simulix Pro',
    icon: path.join(__dirname, 'build', 'icon.png'), backgroundColor: '#151b26', show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, spellcheck: false }
  });
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
  win.once('ready-to-show', () => { win.maximize(); win.show(); const f = fileArg(process.argv); if (f) sendOpen(f); });
  updater.init(win);
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });

  // Port série (Web Serial) : sélection automatique d'une carte Arduino ou du premier port disponible
  const ses = win.webContents.session;
  ses.on('select-serial-port', async (event, ports, wc, callback) => {
    event.preventDefault();
    if (!ports.length) { dialog.showMessageBox(win, { type: 'warning', message: 'Aucun port série détecté', detail: 'Branchez la carte Arduino en USB et vérifiez que son pilote est installé.' }); return callback(''); }
    if (ports.length === 1) return callback(ports[0].portId);
    const labels = ports.map(p => (p.displayName || p.portName || 'Port') + (p.portName ? ' (' + p.portName + ')' : ''));
    const pref = ports.findIndex(p => /arduino|ch340|usb.?serial|cp210|ftdi/i.test((p.displayName || '') + (p.portName || '')));
    const r = await dialog.showMessageBox(win, { type: 'question', message: 'Choisissez le port de la carte', buttons: [...labels, 'Annuler'], defaultId: pref >= 0 ? pref : 0, cancelId: labels.length });
    callback(r.response < labels.length ? ports[r.response].portId : '');
  });
  ses.setPermissionCheckHandler((wc, perm) => perm === 'serial' || perm === 'clipboard-sanitized-write' || perm === 'clipboard-read');
  ses.setDevicePermissionHandler(d => d.deviceType === 'serial');
}

function sendOpen(f) { try { win.webContents.send('open-file', fs.readFileSync(f, 'utf8')); } catch (e) { dialog.showErrorBox('Simulix Pro', 'Impossible d\'ouvrir ' + f); } }
const menuCmd = cmd => () => win && win.webContents.send('menu', cmd);

function buildMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Fichier', submenu: [
      { label: 'Nouveau projet', accelerator: 'CmdOrCtrl+N', click: menuCmd('new') },
      { label: 'Ouvrir…', accelerator: 'CmdOrCtrl+O', click: menuCmd('open') },
      { label: 'Enregistrer…', accelerator: 'CmdOrCtrl+S', click: menuCmd('save') },
      { type: 'separator' },
      { label: 'Exporter tous les folios en PDF…', accelerator: 'CmdOrCtrl+P', click: menuCmd('pdf') },
      { label: 'Exporter le folio en image PNG…', click: menuCmd('png') },
      { type: 'separator' }, { role: 'quit', label: 'Quitter' }] },
    { label: 'Édition', submenu: [{ role: 'cut', label: 'Couper' }, { role: 'copy', label: 'Copier' }, { role: 'paste', label: 'Coller' }, { role: 'selectAll', label: 'Tout sélectionner' }] },
    { label: 'Simulation', submenu: [{ label: 'Démarrer', accelerator: 'F5', click: menuCmd('run') }, { label: 'Arrêter', accelerator: 'Shift+F5', click: menuCmd('stop') }] },
    { label: 'Outils', submenu: [{ label: 'Outils d\'ingénierie (nomenclature, vérification…)', click: menuCmd('eng') }] },
    { label: 'Affichage', submenu: [{ role: 'resetZoom', label: 'Taille réelle' }, { role: 'zoomIn', label: 'Agrandir l\'interface' }, { role: 'zoomOut', label: 'Réduire l\'interface' }, { type: 'separator' }, { role: 'togglefullscreen', label: 'Plein écran' }, { role: 'toggleDevTools', label: 'Outils de développement' }] },
    { label: 'Aide', submenu: [{ label: 'Aide de Simulix Pro', accelerator: 'F1', click: menuCmd('help') }, { label: 'Rechercher des mises à jour…', click: menuCmd('updates') }, { label: 'Code source sur GitHub', click: () => shell.openExternal('https://github.com/Pepinou66/simulix-pro') }, { label: 'À propos', click: () => dialog.showMessageBox(win, { title: 'Simulix Pro', message: 'Simulix Pro ' + app.getVersion(), detail: 'Conception et simulation de systèmes automatisés : pneumatique, hydraulique, électrique, automate programmable (Ladder, GRAFCET), électronique numérique.\n\nPilotes : Arduino (port série USB), automates Modbus TCP.' }) }] }
  ]));
}

ipcMain.handle('file:save', async (_, name, text, ext) => {
  const r = await dialog.showSaveDialog(win, { defaultPath: name, filters: FILTERS[ext] || [] }); if (r.canceled || !r.filePath) return null;
  fs.writeFileSync(r.filePath, text, 'utf8'); return r.filePath;
});
ipcMain.handle('file:open', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: FILTERS.sxp }); if (r.canceled || !r.filePaths[0]) return null;
  return { name: path.basename(r.filePaths[0]), text: fs.readFileSync(r.filePaths[0], 'utf8') };
});
ipcMain.handle('file:saveDataURL', async (_, name, url) => {
  const r = await dialog.showSaveDialog(win, { defaultPath: name, filters: FILTERS.png }); if (r.canceled || !r.filePath) return null;
  fs.writeFileSync(r.filePath, Buffer.from(url.split(',')[1], 'base64')); return r.filePath;
});
ipcMain.handle('file:pdf', async (_, name, pages) => {
  const r = await dialog.showSaveDialog(win, { defaultPath: name, filters: FILTERS.pdf }); if (r.canceled || !r.filePath) return null;
  const html = '<!DOCTYPE html><html><head><style>@page{size:A3 landscape;margin:0}body{margin:0}img{width:100%;height:100vh;object-fit:contain;display:block;page-break-after:always}</style></head><body>' + pages.map(p => '<img src="' + p + '">').join('') + '</body></html>';
  const tmp = path.join(app.getPath('temp'), 'simulix_print.html'); fs.writeFileSync(tmp, html);
  const pw = new BrowserWindow({ show: false }); await pw.loadFile(tmp);
  const data = await pw.webContents.printToPDF({ pageSize: 'A3', landscape: true, printBackground: true, margins: { marginType: 'none' } });
  pw.destroy(); fs.writeFileSync(r.filePath, data); return r.filePath;
});
ipcMain.handle('mb:connect', (_, host, port, unit) => mb.connect(host, port, unit));
ipcMain.handle('mb:close', () => { mb.close(); return true; });
ipcMain.handle('mb:readCoils', (_, a, n) => mb.readCoils(a, n));
ipcMain.handle('mb:readDI', (_, a, n) => mb.readDI(a, n));
ipcMain.handle('mb:writeCoils', (_, a, bits) => mb.writeCoils(a, bits));

if (BACKGROUND) {
  // lancé par Windows à l'ouverture de session : mise à jour silencieuse puis fermeture
  app.whenReady().then(() => updater.background());
  app.on('window-all-closed', () => { });
} else if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', (e, argv) => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); const f = fileArg(argv); if (f) sendOpen(f); } });
  app.whenReady().then(() => { buildMenu(); createWindow(); });
  app.on('window-all-closed', () => { mb.close(); app.quit(); });
}
