import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { z } from 'zod'
import { handlers, UserError } from './handlers'
import type { Result } from '../shared/types'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1000,
    minHeight: 640,
    title: 'Gestion de lotissements',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  // Aucun site externe dans cette application : tout lien externe s'ouvre dans le navigateur système.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://') && !url.startsWith(process.env['ELECTRON_RENDERER_URL'] ?? 'file://')) e.preventDefault()
  })
  if (process.env['ELECTRON_RENDERER_URL']) void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
}

ipcMain.handle('api', async (_e, name: unknown, arg: unknown): Promise<Result<unknown>> => {
  const h = typeof name === 'string' && Object.hasOwn(handlers, name) ? handlers[name] : undefined
  if (!h) return { ok: false, error: 'Commande inconnue' }
  try {
    return { ok: true, data: await h(arg) }
  } catch (e) {
    if (e instanceof UserError) return { ok: false, error: e.message }
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? 'Données invalides' }
    console.error(`[api:${name}]`, e)
    return { ok: false, error: 'Erreur inattendue (voir le journal du logiciel)' }
  }
})

void app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
