import { contextBridge, ipcRenderer } from 'electron'
import type { Result } from '../shared/types'

contextBridge.exposeInMainWorld('api', {
  call: <T>(name: string, arg?: unknown): Promise<Result<T>> => ipcRenderer.invoke('api', name, arg),
})
