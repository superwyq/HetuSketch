import { BrowserWindow, app } from 'electron';
import { join } from 'node:path';

const isDevelopment = !app.isPackaged;

let floatingWindow: BrowserWindow | null = null;
let floatingPinned = true;

export interface FloatingState {
  visible: boolean;
  pinned: boolean;
}

export function createFloatingWindow(): BrowserWindow {
  floatingWindow = new BrowserWindow({
    width: 420,
    height: 560,
    minWidth: 360,
    minHeight: 420,
    title: 'HetuSketch 速查',
    show: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    frame: true,
    backgroundColor: '#17140f',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });

  if (isDevelopment && process.env.ELECTRON_RENDERER_URL) {
    void floatingWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}#/quick-lookup`);
  } else {
    void floatingWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'quick-lookup' });
  }

  return floatingWindow;
}

export function floatingState(): FloatingState {
  return { visible: Boolean(floatingWindow?.isVisible()), pinned: floatingPinned };
}

export function showFloatingWindow(): FloatingState {
  if (!floatingWindow || floatingWindow.isDestroyed()) {
    createFloatingWindow();
  }
  floatingWindow!.setAlwaysOnTop(floatingPinned, 'floating');
  floatingWindow!.show();
  floatingWindow!.focus();
  return floatingState();
}

export function hideFloatingWindow(): FloatingState {
  floatingWindow?.hide();
  return floatingState();
}

export function toggleFloatingWindow(): FloatingState {
  if (floatingWindow?.isVisible()) {
    return hideFloatingWindow();
  }
  return showFloatingWindow();
}

export function setFloatingPinned(pinned: boolean): FloatingState {
  floatingPinned = pinned;
  floatingWindow?.setAlwaysOnTop(pinned, 'floating');
  return floatingState();
}
