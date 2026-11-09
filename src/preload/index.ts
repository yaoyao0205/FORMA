import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IPC } from '@shared/ipc'
import type { ScanProgress } from '@shared/types'

function subscribe(channel: string) {
  return (cb: (p: ScanProgress) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: ScanProgress): void => {
      cb(payload)
    }
    ipcRenderer.on(channel, listener)
    return () => {
      ipcRenderer.removeListener(channel, listener)
    }
  }
}

/** 无载荷事件（例如「模型记录被后台改动，请刷新」）的订阅 */
function subscribeVoid(channel: string) {
  return (cb: () => void): (() => void) => {
    const listener = (): void => cb()
    ipcRenderer.on(channel, listener)
    return () => {
      ipcRenderer.removeListener(channel, listener)
    }
  }
}

const api = {
  /** macOS / Windows 窗口控制差异（交通灯留白、按钮顺序）用得到 */
  platform: process.platform,
  library: {
    list: () => ipcRenderer.invoke(IPC.libraryList),
    create: (req: unknown) => ipcRenderer.invoke(IPC.libraryCreate, req),
    update: (req: unknown) => ipcRenderer.invoke(IPC.libraryUpdate, req),
    remove: (req: unknown) => ipcRenderer.invoke(IPC.libraryRemove, req),
    pickFolder: (req?: unknown) => ipcRenderer.invoke(IPC.libraryPickFolder, req ?? {}),
    scan: (req: unknown) => ipcRenderer.invoke(IPC.libraryScan, req),
    cancelScan: (req: unknown) => ipcRenderer.invoke(IPC.libraryScanCancel, req),
    onScanProgress: subscribe(IPC.importProgress)
  },
  models: {
    query: (params: unknown) => ipcRenderer.invoke(IPC.modelsQuery, params),
    get: (req: unknown) => ipcRenderer.invoke(IPC.modelsGet, req),
    update: (req: unknown) => ipcRenderer.invoke(IPC.modelsUpdate, req),
    remove: (req: unknown) => ipcRenderer.invoke(IPC.modelsDelete, req),
    restore: (req: unknown) => ipcRenderer.invoke(IPC.modelsRestore, req),
    duplicates: (req?: unknown) => ipcRenderer.invoke(IPC.modelsDuplicates, req ?? {}),
    reveal: (req: unknown) => ipcRenderer.invoke(IPC.modelsReveal, req),
    openWith: (req: unknown) => ipcRenderer.invoke(IPC.modelsOpenWith, req)
  },
  importPaths: (req: unknown) => ipcRenderer.invoke(IPC.importPaths, req),
  onImportProgress: subscribe(IPC.importProgress),
  onModelsChanged: subscribeVoid(IPC.modelsChanged),
  geometry: {
    load: (req: unknown) => ipcRenderer.invoke(IPC.geometryLoad, req)
  },
  thumbnail: {
    save: (req: unknown) => ipcRenderer.invoke(IPC.thumbnailSave, req)
  },
  tags: {
    list: () => ipcRenderer.invoke(IPC.tagsList),
    create: (req: unknown) => ipcRenderer.invoke(IPC.tagsCreate, req),
    update: (req: unknown) => ipcRenderer.invoke(IPC.tagsUpdate, req),
    remove: (req: unknown) => ipcRenderer.invoke(IPC.tagsDelete, req)
  },
  projects: {
    list: () => ipcRenderer.invoke(IPC.projectsList),
    create: (req: unknown) => ipcRenderer.invoke(IPC.projectsCreate, req),
    update: (req: unknown) => ipcRenderer.invoke(IPC.projectsUpdate, req),
    remove: (req: unknown) => ipcRenderer.invoke(IPC.projectsDelete, req)
  },
  print: {
    add: (req: unknown) => ipcRenderer.invoke(IPC.printAdd, req),
    list: (req: unknown) => ipcRenderer.invoke(IPC.printList, req),
    remove: (req: unknown) => ipcRenderer.invoke(IPC.printDelete, req)
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.settingsGet),
    set: (patch: unknown) => ipcRenderer.invoke(IPC.settingsSet, patch)
  },
  stats: () => ipcRenderer.invoke(IPC.statsGet),
  revealUserData: () => ipcRenderer.invoke(IPC.appRevealUserData),
  chooseExternalApp: () => ipcRenderer.invoke(IPC.appChooseExternalApp),
  setUnit: (req: { id: string; unit: string }) =>
    ipcRenderer.invoke(IPC.modelsUpdate, { id: req.id, patch: { unit: req.unit } }),

  getPathForFile: (file: File): string => {
    try {
      return webUtils.getPathForFile(file)
    } catch {
      return ''
    }
  },

  onMenu: (channel: 'new-library' | 'import' | 'rescan', cb: () => void): (() => void) => {
    const name = `menu:${channel}`
    const listener = (): void => cb()
    ipcRenderer.on(name, listener)
    return () => {
      ipcRenderer.removeListener(name, listener)
    }
  }
}

contextBridge.exposeInMainWorld('forma', api)

export type FormaApi = typeof api
