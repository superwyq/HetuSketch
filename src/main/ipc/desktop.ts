import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc.js';
import { closeMainWindow, minimizeMainWindow, setMainPinned, toggleMainWindowMaximize } from '../desktop/integrations.js';
import { openAppWindow } from '../windows/appWindows.js';
import { hideFloatingWindow, setFloatingPinned, showFloatingWindow, toggleFloatingWindow } from '../windows/floatingWindow.js';

export function registerDesktopIpc(): void {
  ipcMain.handle(IPC_CHANNELS.desktopFloatingToggle, () => toggleFloatingWindow());
  ipcMain.handle(IPC_CHANNELS.desktopFloatingShow, () => showFloatingWindow());
  ipcMain.handle(IPC_CHANNELS.desktopFloatingHide, () => hideFloatingWindow());
  ipcMain.handle(IPC_CHANNELS.desktopFloatingPin, (_event, pinned: unknown) => setFloatingPinned(Boolean(pinned)));
  ipcMain.handle(IPC_CHANNELS.desktopMainPin, (_event, pinned: unknown) => setMainPinned(Boolean(pinned)));
  ipcMain.handle(IPC_CHANNELS.desktopWindowMinimize, () => minimizeMainWindow());
  ipcMain.handle(IPC_CHANNELS.desktopWindowMaximize, () => toggleMainWindowMaximize());
  ipcMain.handle(IPC_CHANNELS.desktopWindowClose, () => closeMainWindow());
  ipcMain.handle(IPC_CHANNELS.desktopOpenWindow, (_event, path: unknown) => {
    const safePath = typeof path === 'string' && path.trim() ? path.trim() : '/';
    openAppWindow(safePath);
  });
}
