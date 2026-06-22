import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc.js';
import type { IpcRegistrationContext } from './types.js';
import { asObject, asRequiredString } from './validators.js';

export function registerSettingsIpc({ storageService }: IpcRegistrationContext): void {
  ipcMain.handle(IPC_CHANNELS.settingSetsList, () => storageService.listSettingSets());
  ipcMain.handle(IPC_CHANNELS.settingSetsGet, (_event, id: unknown) => storageService.getSettingSet(asRequiredString(id, 'settingSetId')));
  ipcMain.handle(IPC_CHANNELS.settingSetsCreate, (_event, input: unknown) => storageService.createSettingSet(asObject(input)));
  ipcMain.handle(IPC_CHANNELS.settingSetsUpdate, (_event, input: unknown) => storageService.updateSettingSet(asObject(input)));
  ipcMain.handle(IPC_CHANNELS.settingSetsDelete, (_event, id: unknown, strategy: unknown) =>
    storageService.deleteSettingSet(asRequiredString(id, 'settingSetId'), strategy === 'detach_books' ? 'detach_books' : 'block')
  );
}
