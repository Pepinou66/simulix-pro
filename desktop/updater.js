'use strict';
/* =====================================================================
   Mises à jour automatiques (GitHub Releases via electron-updater)
   Modes :
     manual  : uniquement via « Rechercher des mises à jour »
     ask     : vérification à l'ouverture, l'utilisateur choisit
     open    : téléchargement et installation automatiques à l'ouverture
     close   : téléchargement en arrière-plan, installation à la fermeture
   Option startup : vérification et installation silencieuses au démarrage de Windows
   ===================================================================== */
const { app, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
let autoUpdater = null;
try { autoUpdater = require('electron-updater').autoUpdater; } catch (e) { autoUpdater = null; }

const DEF = { mode: 'ask', startup: false, lastCheck: null, skip: null };
const file = () => path.join(app.getPath('userData'), 'update-settings.json');
function load() { try { return Object.assign({}, DEF, JSON.parse(fs.readFileSync(file(), 'utf8'))); } catch (e) { return Object.assign({}, DEF); } }
function save(s) { try { fs.writeFileSync(file(), JSON.stringify(s, null, 2)); } catch (e) { } }

let settings = DEF, win = null, state = { status: 'idle' }, manual = false;
const send = () => { if (win && !win.isDestroyed()) win.webContents.send('upd:state', Object.assign({ version: app.getVersion(), settings }, state)); };
const set = s => { state = Object.assign({}, state, s); send(); };

function applyStartup() {
  if (process.platform !== 'win32' || !app.isPackaged) return;
  app.setLoginItemSettings({ openAtLogin: !!settings.startup, path: process.execPath, args: ['--background-update'] });
}
function friendly(err) {
  const m = String(err && err.message || err);
  if (/404|Not Found|no published versions|Unable to find latest version/i.test(m)) return 'Le serveur de mises à jour n\'est pas encore configuré (aucune version publiée).';
  if (/ENOTFOUND|ETIMEDOUT|ECONNREFUSED|net::|getaddrinfo|ECONNRESET/i.test(m)) return 'Pas de connexion Internet : impossible de vérifier les mises à jour.';
  return m.split('\n')[0].slice(0, 200);
}

function check(isManual) {
  manual = !!isManual;
  if (!autoUpdater || !app.isPackaged) { set({ status: 'error', error: 'Les mises à jour ne fonctionnent que dans la version installée de Simulix Pro.' }); return; }
  set({ status: 'checking', error: null });
  settings.lastCheck = new Date().toISOString(); save(settings);
  autoUpdater.checkForUpdates().catch(e => set({ status: 'error', error: friendly(e) }));
  setTimeout(() => { if (state.status === 'checking') set({ status: 'error', error: 'Pas de réponse du serveur de mises à jour (vérifiez la connexion Internet).' }); }, 30000);
}

function init(mainWindow) {
  win = mainWindow; settings = load(); applyStartup();
  if (autoUpdater) {
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.allowDowngrade = false;
    autoUpdater.on('update-available', info => {
      set({ status: 'available', latest: info.version, notes: typeof info.releaseNotes === 'string' ? info.releaseNotes.replace(/<[^>]+>/g, '') : '', date: info.releaseDate });
      if (settings.mode === 'open' || settings.mode === 'close') download();
    });
    autoUpdater.on('update-not-available', () => set({ status: 'uptodate', latest: app.getVersion() }));
    autoUpdater.on('download-progress', p => set({ status: 'downloading', percent: Math.round(p.percent), speed: p.bytesPerSecond }));
    autoUpdater.on('update-downloaded', info => {
      set({ status: 'downloaded', latest: info.version });
      if (settings.mode === 'open') setTimeout(() => install(), 2500);
      if (settings.mode === 'close') autoUpdater.autoInstallOnAppQuit = true;
    });
    autoUpdater.on('error', e => set({ status: 'error', error: friendly(e) }));
  }
  ipcMain.handle('upd:get', () => Object.assign({ version: app.getVersion(), settings, packaged: app.isPackaged }, state));
  ipcMain.handle('upd:check', () => { check(true); return true; });
  ipcMain.handle('upd:download', () => { download(); return true; });
  ipcMain.handle('upd:install', () => { install(); return true; });
  ipcMain.handle('upd:later', () => { if (autoUpdater) autoUpdater.autoInstallOnAppQuit = true; set({ status: 'downloaded', later: true }); return true; });
  ipcMain.handle('upd:settings', (_, s) => { settings = Object.assign(settings, s || {}); save(settings); applyStartup(); send(); return settings; });
  // vérification à l'ouverture
  if (settings.mode !== 'manual') setTimeout(() => check(false), 4000);
}
function download() { if (!autoUpdater) return; set({ status: 'downloading', percent: 0 }); autoUpdater.downloadUpdate().catch(e => set({ status: 'error', error: friendly(e) })); }
function install() { if (!autoUpdater) return; setImmediate(() => autoUpdater.quitAndInstall(false, true)); }

// Lancement en arrière-plan au démarrage de Windows : vérifie, installe en silence puis quitte
function background() {
  settings = load();
  if (!autoUpdater) return app.quit();
  autoUpdater.autoDownload = true; autoUpdater.autoInstallOnAppQuit = false;
  const done = () => app.quit();
  autoUpdater.on('update-not-available', done);
  autoUpdater.on('error', done);
  autoUpdater.on('update-downloaded', () => autoUpdater.quitAndInstall(true, false));
  setTimeout(done, 10 * 60 * 1000);
  autoUpdater.checkForUpdates().catch(done);
}
module.exports = { init, check, background };
