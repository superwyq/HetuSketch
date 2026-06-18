import { join } from 'node:path';
import { tmpdir } from 'node:os';

export const app = {
  getPath: () => join(tmpdir(), 'hetusketch-vitest-user-data'),
  getName: () => 'HetuSketch Test',
  getVersion: () => '0.0.0-test',
  isPackaged: false,
  whenReady: () => Promise.resolve(),
  on: () => undefined,
  quit: () => undefined
};

export class BrowserWindow {
  static getAllWindows(): BrowserWindow[] {
    return [];
  }
}

export const ipcMain = {
  handle: () => undefined
};

export const shell = {
  openExternal: () => Promise.resolve()
};
