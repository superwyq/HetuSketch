import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc.js';
import type { IpcRegistrationContext } from './types.js';
import { asEntryType, asObject, asRequiredString, asValidationRequest } from './validators.js';

export function registerEntriesIpc({ storageService }: IpcRegistrationContext): void {
  ipcMain.handle(IPC_CHANNELS.entriesList, (_event, query: unknown) => storageService.listEntries(asObject(query)));
  ipcMain.handle(IPC_CHANNELS.entriesGet, (_event, projectId: unknown, type: unknown, entryId: unknown) =>
    storageService.readEntry(asRequiredString(projectId, 'projectId'), asEntryType(type), asRequiredString(entryId, 'entryId'))
  );
  ipcMain.handle(IPC_CHANNELS.entriesCreate, async (_event, input: unknown) => storageService.createEntry(asObject(input)));
  ipcMain.handle(IPC_CHANNELS.entriesUpdate, async (_event, input: unknown) => storageService.updateEntry(asObject(input)));
  ipcMain.handle(IPC_CHANNELS.entriesDelete, async (_event, projectId: unknown, type: unknown, entryId: unknown) =>
    storageService.deleteEntry(asRequiredString(projectId, 'projectId'), asEntryType(type), asRequiredString(entryId, 'entryId'))
  );

  ipcMain.handle(IPC_CHANNELS.validationBasic, async (_event, request: unknown) => storageService.validateContent(asValidationRequest(request)));
  ipcMain.handle(IPC_CHANNELS.validationEnhanced, async (_event, request: unknown) => storageService.validateContentEnhanced(asValidationRequest(request)));
}
