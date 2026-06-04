const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('desktop', {
  isDesktop: true,
  relaunch: () => ipcRenderer.invoke('app:relaunch'),
  pickRestoreFile: () => ipcRenderer.invoke('restore:pickFile'),
  openBackupsFolder: () => ipcRenderer.invoke('backup:openFolder'),
})
