import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc.js';
import type { PlotboardGenerationRequest } from '../../shared/storageTypes.js';
import type { IpcRegistrationContext } from './types.js';
import { asObject, asRequiredString } from './validators.js';

export function registerPlotboardsIpc({ storageService }: IpcRegistrationContext): void {
  ipcMain.handle(IPC_CHANNELS.plotboardsCreate, (_event, input: unknown) => storageService.createPlotboard(asObject(input)));
  ipcMain.handle(IPC_CHANNELS.plotboardsOpen, (_event, bookId: unknown, chapterId: unknown) =>
    storageService.openPlotboard(asRequiredString(bookId, 'bookId'), asRequiredString(chapterId, 'chapterId'))
  );
  ipcMain.handle(IPC_CHANNELS.plotboardsSave, (_event, plotboard: unknown) => storageService.savePlotboard(asObject(plotboard)));
  ipcMain.handle(IPC_CHANNELS.plotboardsSaveSnapshot, (_event, bookId: unknown, snapshot: unknown) =>
    storageService.saveStateSnapshot(asRequiredString(bookId, 'bookId'), asObject(snapshot))
  );
  ipcMain.handle(IPC_CHANNELS.plotboardsLoadSnapshot, (_event, bookId: unknown, chapterId: unknown) =>
    storageService.loadStateSnapshot(asRequiredString(bookId, 'bookId'), asRequiredString(chapterId, 'chapterId'))
  );
  ipcMain.handle(IPC_CHANNELS.plotboardsSyncIndex, (_event, bookId: unknown) => storageService.syncPlotboardIndex(asRequiredString(bookId, 'bookId')));
  ipcMain.handle(IPC_CHANNELS.plotboardsExportOutline, (_event, bookId: unknown, chapterId: unknown) =>
    storageService.exportPlotboardOutline(asRequiredString(bookId, 'bookId'), asRequiredString(chapterId, 'chapterId'))
  );
  ipcMain.handle(IPC_CHANNELS.plotboardsSaveChapterSnapshot, (_event, bookId: unknown, chapterId: unknown) =>
    storageService.saveChapterBodySnapshot(asRequiredString(bookId, 'bookId'), asRequiredString(chapterId, 'chapterId'))
  );
  ipcMain.handle(IPC_CHANNELS.plotboardsWriteGeneratedMarkdown, (_event, input: unknown) => storageService.writeGeneratedMarkdown(asObject(input)));
  ipcMain.handle(IPC_CHANNELS.plotboardsBuildAiContext, (_event, input: unknown) => storageService.buildPlotboardAiContext(asObject(input)));
  ipcMain.handle(IPC_CHANNELS.plotboardsGenerate, (_event, input: unknown) => storageService.generatePlotboardMarkdown(asObject(input)));
  ipcMain.handle(IPC_CHANNELS.plotboardsSettleDiffs, (_event, input: unknown) => storageService.settlePlotboardDiffs(asObject(input)));
  ipcMain.handle(IPC_CHANNELS.plotboardsValidate, (_event, input: unknown) => storageService.validatePlotboard(asObject(input)));

  ipcMain.on(IPC_CHANNELS.plotboardsStreamGenerate, async (event, input: unknown) => {
    const request = asObject(input) as Record<string, unknown>;
    const requestId = typeof request.requestId === 'string' ? request.requestId : '';
    const channel = (suffix: string): string => `${IPC_CHANNELS.plotboardsStreamGenerate}:${suffix}:${requestId}`;
    try {
      let finalResult: unknown;
      for await (const item of storageService.streamPlotboardGeneration(request as unknown as PlotboardGenerationRequest)) {
        event.sender.send(channel('chunk'), item.chunk);
        if (item.result) finalResult = item.result;
      }
      event.sender.send(channel('end'), finalResult);
    } catch (error) {
      event.sender.send(channel('error'), error instanceof Error ? error.message : '剧情画布生成失败');
    }
  });
}
