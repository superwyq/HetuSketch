import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc.js';
import type { IpcRegistrationContext } from './types.js';
import { asOptionalLimit, asOptionalString, toSearchQuery } from './validators.js';

export function registerSearchIpc({ storageService }: IpcRegistrationContext): void {
  ipcMain.handle(IPC_CHANNELS.searchPreview, (_event, keyword: unknown) => {
    const safeKeyword = typeof keyword === 'string' ? keyword.trim().slice(0, 80) : '';
    return storageService.search({ keyword: safeKeyword, limit: 8 });
  });

  ipcMain.handle(IPC_CHANNELS.searchGlobal, (_event, query: unknown) => storageService.search(toSearchQuery(query)));
  ipcMain.handle(IPC_CHANNELS.recentList, (_event, projectId: unknown, limit: unknown) =>
    storageService.listRecentAccess(asOptionalString(projectId), asOptionalLimit(limit))
  );
  ipcMain.handle(IPC_CHANNELS.dashboardStats, (_event, projectId: unknown) => storageService.getDashboardStats(asOptionalString(projectId)));
}
