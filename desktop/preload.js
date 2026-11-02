'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('simulix', {
  isDesktop: true,
  saveFile: (name, text, ext) => ipcRenderer.invoke('file:save', name, text, ext),
  openFile: () => ipcRenderer.invoke('file:open'),
  saveDataURL: (name, url) => ipcRenderer.invoke('file:saveDataURL', name, url),
  savePDF: (name, pages) => ipcRenderer.invoke('file:pdf', name, pages),
  onMenu: cb => ipcRenderer.on('menu', (_, cmd) => cb(cmd)),
  onOpenFile: cb => ipcRenderer.on('open-file', (_, text) => cb(text)),
  setMenuLang: dict => ipcRenderer.send('i18n:menu', dict),
  onLangs: cb => { ipcRenderer.invoke('i18n:langs').then(cb); },
  openLangFolder: () => ipcRenderer.invoke('i18n:openDir'),
  updates: {
    get: () => ipcRenderer.invoke('upd:get'), check: () => ipcRenderer.invoke('upd:check'), download: () => ipcRenderer.invoke('upd:download'),
    install: () => ipcRenderer.invoke('upd:install'), later: () => ipcRenderer.invoke('upd:later'), settings: s => ipcRenderer.invoke('upd:settings', s),
    onState: cb => ipcRenderer.on('upd:state', (_, st) => cb(st))
  },
  modbus: {
    connect: (host, port, unit) => ipcRenderer.invoke('mb:connect', host, port, unit),
    close: () => ipcRenderer.invoke('mb:close'),
    readCoils: (a, n) => ipcRenderer.invoke('mb:readCoils', a, n),
    readDI: (a, n) => ipcRenderer.invoke('mb:readDI', a, n),
    writeCoils: (a, bits) => ipcRenderer.invoke('mb:writeCoils', a, bits)
  }
});
