import { Menu, Tray, app, globalShortcut, nativeImage } from 'electron';
import { getMainWindow, showMainWindow } from '../windows/appWindows.js';
import { toggleFloatingWindow } from '../windows/floatingWindow.js';

let tray: Tray | null = null;
let mainPinned = false;

export function registerDesktopIntegrations(): void {
  const trayIcon = nativeImage.createEmpty();
  tray = new Tray(trayIcon);
  tray.setToolTip('HetuSketch 河图速写');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示主窗口', click: () => showMainWindow() },
    { label: '切换悬浮速查', accelerator: 'Ctrl+Shift+H', click: () => toggleFloatingWindow() },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() }
  ]));
  tray.on('click', () => showMainWindow());

  globalShortcut.register('CommandOrControl+Shift+H', () => {
    toggleFloatingWindow();
  });
}

export function unregisterDesktopIntegrations(): void {
  globalShortcut.unregisterAll();
  tray = null;
}

export function setMainPinned(pinned: boolean): { pinned: boolean } {
  mainPinned = pinned;
  getMainWindow()?.setAlwaysOnTop(pinned, 'normal');
  return { pinned: mainPinned };
}

export function minimizeMainWindow(): void {
  getMainWindow()?.minimize();
}

export function toggleMainWindowMaximize(): { maximized: boolean } {
  const mainWindow = getMainWindow();
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
  return { maximized: Boolean(mainWindow?.isMaximized()) };
}

export function closeMainWindow(): void {
  getMainWindow()?.close();
}
