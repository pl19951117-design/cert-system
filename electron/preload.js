const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('desktop', {
  isDesktop: true,
  relaunch: () => ipcRenderer.invoke('app:relaunch'),
  pickRestoreFile: () => ipcRenderer.invoke('restore:pickFile'),
  openBackupsFolder: () => ipcRenderer.invoke('backup:openFolder'),
  // 局域网共享
  lanGetStatus: () => ipcRenderer.invoke('lan:getStatus'),
  lanSetEnabled: (enabled) => ipcRenderer.invoke('lan:setEnabled', enabled),
  lanAddFirewallRule: () => ipcRenderer.invoke('lan:addFirewallRule'),
})
