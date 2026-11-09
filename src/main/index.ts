import { app, BrowserWindow, Menu, net, protocol, shell } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { writeFile } from 'node:fs/promises'
import { initDatabase, closeDatabase } from './services/database'
import { registerIpc } from './ipc'
import { initWatcher, stopAllWatchers } from './services/watcher'
import { ImportService } from './services/imports'
import { createLibrary, listLibraries } from './services/libraries'
import { logError, logInfo } from './utils/log'
import { thumbnailPath } from './services/thumbnails'

let mainWindow: BrowserWindow | null = null
const importService = new ImportService()

const isDev = !app.isPackaged

app.setName('FORMA')

// 自动化验收钩子：把 userData 指向隔离目录，压测/回归不污染真实库。
// 必须在 app ready 之前设置才生效。
if (process.env.FORMA_DATA_DIR) {
  app.setPath('userData', process.env.FORMA_DATA_DIR)
  app.setPath('sessionData', process.env.FORMA_DATA_DIR)
}

function buildMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'FORMA',
      submenu: [
        { role: 'about', label: '关于 FORMA' },
        { type: 'separator' },
        { role: 'hide', label: '隐藏 FORMA' },
        { role: 'hideOthers', label: '隐藏其他' },
        { type: 'separator' },
        { role: 'quit', label: '退出 FORMA' }
      ]
    },
    {
      label: '文件',
      submenu: [
        {
          label: '添加模型库…',
          accelerator: 'Cmd+N',
          click: () => mainWindow?.webContents.send('menu:new-library')
        },
        {
          label: '导入模型…',
          accelerator: 'Cmd+O',
          click: () => mainWindow?.webContents.send('menu:import')
        },
        {
          label: '刷新当前库',
          accelerator: 'Cmd+R',
          click: () => mainWindow?.webContents.send('menu:rescan')
        },
        { type: 'separator' },
        {
          label: '在访达中显示数据目录',
          click: () => {
            shell.openPath(app.getPath('userData'))
          }
        },
        { role: 'close', label: '关闭窗口' }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' }
      ]
    },
    {
      label: '视图',
      submenu: [
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' }
      ]
    },
    {
      label: '窗口',
      submenu: [
        { role: 'minimize', label: '最小化' },
        { role: 'zoom', label: '缩放' },
        { role: 'front', label: '前置全部窗口' }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1560,
    height: 980,
    minWidth: 1180,
    minHeight: 720,
    show: false,
    backgroundColor: '#141619',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 20 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webgl: true,
      spellcheck: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (isDev && devUrl) {
    void mainWindow.loadURL(devUrl)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.webContents.on('console-message', (_event, level, message) => {
    logInfo(`renderer[${level}]`, String(message).slice(0, 400))
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // 自动化验收钩子：设置 FORMA_SHOT 后截图并退出
  const shotPath = process.env.FORMA_SHOT
  if (shotPath) {
    mainWindow.webContents.on('did-finish-load', () => {
      const clickIndex = process.env.FORMA_SHOT_CLICK_CARD
      if (clickIndex !== undefined) {
        setTimeout(() => {
          void (async () => {
            if (!mainWindow) return
            const clicked = await mainWindow.webContents.executeJavaScript(
              `(() => {
                const cards = document.querySelectorAll('[data-asset-card]')
                const el = cards[${Number(clickIndex) || 0}]
                if (!el) return 'no-card'
                el.click()
                return 'ok:' + el.className.slice(0, 60)
              })()`
            )
            logInfo(`screenshot click card #${clickIndex} -> ${String(clicked)}`)
            setTimeout(() => {
              void (async () => {
                if (!mainWindow) return
                const probe = await mainWindow.webContents.executeJavaScript(
                  `(() => {
                    const aside = document.querySelectorAll('aside')[document.querySelectorAll('aside').length - 1]
                    const txt = aside ? aside.textContent || '' : ''
                    return 'inspector=' + (txt.includes('几何信息') ? 'selected' : 'empty') + ' len=' + txt.length
                  })()`
                )
                logInfo(`screenshot probe -> ${String(probe)}`)
              })()
            }, 900)
          })()
        }, 3500)
      }
      // 通用验收钩子：在截图前注入任意脚本，用来切到指定 UI 状态
      // （折叠侧栏、紧凑列表、筛选条等），返回结果会打到日志里便于断言。
      const shotScript = process.env.FORMA_SHOT_SCRIPT
      if (shotScript) {
        setTimeout(() => {
          void (async () => {
            if (!mainWindow) return
            try {
              const result = await mainWindow.webContents.executeJavaScript(shotScript)
              logInfo(`screenshot script -> ${String(result)}`)
            } catch (error) {
              logError('screenshot script failed', error)
            }
          })()
        }, 4200)
      }
      setTimeout(() => {
        void (async () => {
          try {
            if (!mainWindow) return
            // 注入脚本改过界面之后，窗口可能仍在用旧合成帧；
            // show/聚焦 + invalidate + 让出一帧，capturePage 才会拿到最新画面。
            if (!mainWindow.isVisible()) mainWindow.show()
            mainWindow.focus()
            mainWindow.webContents.invalidate()
            await new Promise((resolve) => setTimeout(resolve, 600))
            const image = await mainWindow.webContents.capturePage()
            await writeFile(shotPath, image.toPNG())
            logInfo('screenshot written', shotPath)
          } catch (error) {
            logError('screenshot failed', error)
          } finally {
            app.quit()
          }
        })()
      }, Number(process.env.FORMA_SHOT_DELAY ?? 6000))
    })
  }
}

async function seedIfRequested(): Promise<void> {
  const seedDir = process.env.FORMA_SEED_DIR
  if (!seedDir) return
  try {
    const libs = listLibraries()
    if (libs.length > 0) {
      logInfo('seed skipped: library exists')
      return
    }
    const lib = await createLibrary({ name: '示例模型库', path: seedDir, mode: 'reference' })
    logInfo('seed library created', lib.id)
    await importService.importPaths(lib.id, [seedDir])
    logInfo('seed import finished')
  } catch (error) {
    logError('seed failed', error)
  }
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'forma-thumb', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
])

app.whenReady().then(async () => {
  protocol.handle('forma-thumb', (request) => {
    const url = new URL(request.url)
    const id = url.pathname.replace(/^\//, '').split('/').pop() ?? ''
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
      return new Response('bad request', { status: 400 })
    }
    return net.fetch(pathToFileURL(thumbnailPath(id)).toString())
  })
  initDatabase(app.getPath('userData'))
  registerIpc(() => mainWindow, importService)
  buildMenu()
  await seedIfRequested()
  // 建库（含 seed）之后再启动文件夹监控，确保启动期已存在的库都被覆盖
  initWatcher(importService)
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  stopAllWatchers()
  closeDatabase()
})

process.on('uncaughtException', (error) => {
  logError('uncaught exception', error)
})
