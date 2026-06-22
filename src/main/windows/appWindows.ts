import { BrowserWindow, Menu, app, shell } from 'electron';
import { join } from 'node:path';

const isDevelopment = !app.isPackaged;
const allowedAppRoutes = new Set([
  '/',
  '/dashboard',
  '/workspace/data',
  '/data/characters',
  '/data/worlds',
  '/data/plots',
  '/workspace/editor',
  '/setting-sets',
  '/characters',
  '/worlds',
  '/plots',
  '/studio',
  '/checks',
  '/projects',
  '/search',
  '/settings'
]);

let mainWindow: BrowserWindow | null = null;

export interface MainWindowOptions {
  onReadyToShow?: () => void;
}

export function createMainWindow(options: MainWindowOptions = {}): BrowserWindow {
  Menu.setApplicationMenu(null);
  mainWindow = createAppBrowserWindow();

  mainWindow.once('ready-to-show', () => {
    options.onReadyToShow?.();
    mainWindow?.show();
  });

  loadRenderer(mainWindow, '/');
  return mainWindow;
}

export function ensureMainWindow(): BrowserWindow {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow();
  }

  return mainWindow!;
}

export function showMainWindow(): void {
  const window = ensureMainWindow();
  if (window.isMinimized()) {
    window.restore();
  }
  window.show();
  window.focus();
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
}

export function openAppWindow(path: string): void {
  const route = normalizeAppRoute(path);
  const newWindow = createAppBrowserWindow();

  newWindow.once('ready-to-show', () => {
    newWindow.show();
  });

  loadRenderer(newWindow, route);
}

function createAppBrowserWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1080,
    minHeight: 720,
    title: 'HetuSketch 河图速写',
    show: false,
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: '#1f1a14',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });

  window.on('page-title-updated', (event) => {
    event.preventDefault();
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      void shell.openExternal(url);
    }

    return { action: 'deny' };
  });

  return window;
}

function loadRenderer(window: BrowserWindow, route: string): void {
  const hash = route === '/' ? '' : route.slice(1);
  if (isDevelopment && process.env.ELECTRON_RENDERER_URL) {
    const suffix = hash ? `#/${hash}` : '';
    void window.loadURL(`${process.env.ELECTRON_RENDERER_URL}${suffix}`);
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'), hash ? { hash } : undefined);
  }
}

function normalizeAppRoute(path: string): string {
  const rawPath = typeof path === 'string' ? path.trim() : '';
  const withoutHash = rawPath.startsWith('#') ? rawPath.slice(1) : rawPath;
  const pathname = withoutHash.split(/[?#]/, 1)[0] || '/';
  const normalized = pathname.startsWith('/') ? pathname : `/${pathname}`;

  if (!allowedAppRoutes.has(normalized)) {
    return '/';
  }

  return normalized;
}
