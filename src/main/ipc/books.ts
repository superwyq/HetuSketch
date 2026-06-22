import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc.js';
import type { IpcRegistrationContext } from './types.js';
import { asObject, asOptionalString, asRequiredString } from './validators.js';

export function registerBooksIpc({ storageService }: IpcRegistrationContext): void {
  ipcMain.handle(IPC_CHANNELS.booksList, () => storageService.listBooks());
  ipcMain.handle(IPC_CHANNELS.booksGet, (_event, bookId: unknown) => storageService.getBook(asRequiredString(bookId, 'bookId')));
  ipcMain.handle(IPC_CHANNELS.booksCreate, (_event, input: unknown) => storageService.createBook(asObject(input)));
  ipcMain.handle(IPC_CHANNELS.booksUpdate, (_event, input: unknown) => storageService.updateBook(asObject(input)));
  ipcMain.handle(IPC_CHANNELS.booksDelete, (_event, bookId: unknown) => storageService.deleteBook(asRequiredString(bookId, 'bookId')));
  ipcMain.handle(IPC_CHANNELS.booksBindSettingSet, (_event, bookId: unknown, settingSetId: unknown) =>
    storageService.bindBookSettingSet(asRequiredString(bookId, 'bookId'), asOptionalString(settingSetId))
  );

  ipcMain.handle(IPC_CHANNELS.chaptersListTree, (_event, bookId: unknown) => storageService.listBookTree(asRequiredString(bookId, 'bookId')));
  ipcMain.handle(IPC_CHANNELS.chaptersCreateVolume, (_event, input: unknown) => storageService.createVolume(asObject(input)));
  ipcMain.handle(IPC_CHANNELS.chaptersUpdateVolume, (_event, input: unknown) => storageService.updateVolume(asObject(input)));
  ipcMain.handle(IPC_CHANNELS.chaptersCreateChapter, (_event, input: unknown) => storageService.createChapter(asObject(input)));
  ipcMain.handle(IPC_CHANNELS.chaptersUpdateChapter, (_event, input: unknown) => storageService.updateChapter(asObject(input)));
  ipcMain.handle(IPC_CHANNELS.chaptersMoveChapter, (_event, input: unknown) => storageService.moveChapter(asObject(input)));
  ipcMain.handle(IPC_CHANNELS.chaptersDeleteChapter, (_event, bookId: unknown, chapterId: unknown) =>
    storageService.deleteChapter(asRequiredString(bookId, 'bookId'), asRequiredString(chapterId, 'chapterId'))
  );
  ipcMain.handle(IPC_CHANNELS.chaptersDeleteVolume, (_event, bookId: unknown, volumeId: unknown) =>
    storageService.deleteVolume(asRequiredString(bookId, 'bookId'), asRequiredString(volumeId, 'volumeId'))
  );
}
