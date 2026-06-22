import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc.js';
import { getSystemFonts } from '../services/fontService.js';
import type { IpcRegistrationContext } from './types.js';

export function registerSystemIpc({ storageService }: IpcRegistrationContext): void {
  ipcMain.handle(IPC_CHANNELS.indexRebuild, async (_event, projectId: unknown) =>
    storageService.rebuildIndex(typeof projectId === 'string' ? projectId : undefined)
  );

  ipcMain.handle(IPC_CHANNELS.systemFonts, () => getSystemFonts());
}
