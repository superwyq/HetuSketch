import { app, ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc.js';

export function registerAppIpc(): void {
  ipcMain.handle(IPC_CHANNELS.appInfo, () => ({
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform,
    isPackaged: app.isPackaged
  }));

  ipcMain.handle(IPC_CHANNELS.ping, () => ({ ok: true, timestamp: Date.now() }));
}
