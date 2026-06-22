import { BrowserWindow, app } from 'electron';
import { registerDesktopIntegrations, unregisterDesktopIntegrations } from './desktop/integrations.js';
import { registerIpcHandlers } from './ipc/index.js';
import { StorageService } from './services/storageService.js';
import { createMainWindow } from './windows/appWindows.js';

let storageService: StorageService;

// ===== 启动性能计时（性能监控机制）=====
// 记录关键阶段时间戳，启动完成后输出时间线，便于定位回归
const perfMarks: Array<{ name: string; time: number }> = [{ name: 'process.start', time: Date.now() }];
function mark(name: string): void {
  perfMarks.push({ name, time: Date.now() });
}
function logPerf(): void {
  const origin = perfMarks[0].time;
  const lines = perfMarks.map((entry, index) => {
    const delta = index > 0 ? entry.time - perfMarks[index - 1].time : 0;
    return `  +${String(entry.time - origin).padStart(6)}ms  ${entry.name} (Δ${delta}ms)`;
  });
  const total = perfMarks[perfMarks.length - 1].time - origin;
  console.log(`[HetuSketch:perf] startup timeline (total ${total}ms)\n${lines.join('\n')}`);
}

function createMainApplicationWindow(): void {
  createMainWindow({
    onReadyToShow: () => {
      mark('mainWindow.ready-to-show');
      mark('mainWindow.shown');
      // storage 初始化推迟到主窗口就绪后，避免全量文件扫描与窗口加载争抢 I/O
      void storageService.initialize({ watch: true }).then(() => {
        mark('storage.initialized');
        logPerf();
      });
    }
  });
}

app.whenReady().then(() => {
  mark('app.ready');
  // StorageService 构造会打开 SQLite 并执行迁移，放在 app.ready 之后避免阻塞早期启动
  storageService = new StorageService();
  mark('storageService.ctor');
  registerIpcHandlers({ storageService });
  mark('ipc.registered');
  registerDesktopIntegrations();
  mark('desktop.integrated');
  createMainApplicationWindow();
  mark('mainWindow.created');
  // 悬浮窗延迟创建：首次唤起时再加载渲染进程，避免启动时双倍渲染开销

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainApplicationWindow();
    }
  });
});

app.on('before-quit', () => {
  unregisterDesktopIntegrations();
  if (storageService) {
    void storageService.close();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
