// Electron preload 暴露到渲染进程的桥接 API 类型（集中声明，避免多处 declare global 冲突）
// 浏览器（局域网访问）中 window.desktop 为 undefined —— 桌面专属功能据此隐藏。

export type LanAddress = { name: string; address: string }

export type LanStatus = {
  /** 设置里的开关状态 */
  enabled: boolean
  /** 当前服务进程实际是否在对外监听（与 enabled 不同 = 改了开关但还没重启） */
  activeEnabled: boolean
  port: number
  addresses: LanAddress[]
}

export type DesktopBridge = {
  isDesktop: boolean
  relaunch: () => Promise<void>
  pickRestoreFile: () => Promise<{ ok: boolean; canceled?: boolean; error?: string; path?: string; fileName?: string }>
  openBackupsFolder: () => Promise<{ ok: boolean }>
  lanGetStatus: () => Promise<LanStatus>
  lanSetEnabled: (enabled: boolean) => Promise<{ ok: boolean; needsRestart: boolean }>
  lanAddFirewallRule: () => Promise<{ ok: boolean; error?: string }>
}

declare global {
  interface Window {
    desktop?: DesktopBridge
  }
}
