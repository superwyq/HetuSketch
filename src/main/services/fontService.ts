import { execFile } from 'node:child_process';
import { platform } from 'node:os';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const FALLBACK_FONTS = ['Microsoft YaHei', 'SimSun', 'SimHei', 'PingFang SC', 'Hiragino Sans GB', 'WenQuanYi Micro Hei', 'Arial', 'Times New Roman', 'Courier New'];

// 进程内缓存：字体列表在一次会话中基本不变，避免重复启动 PowerShell/fc-list
let cachedFonts: string[] | undefined;

export async function getSystemFonts(): Promise<string[]> {
  if (cachedFonts) return cachedFonts;
  try {
    const os = platform();
    if (os === 'win32') {
      cachedFonts = await listWindowsFonts();
    } else if (os === 'darwin') {
      cachedFonts = await listMacFonts();
    } else {
      cachedFonts = await listLinuxFonts();
    }
    return cachedFonts;
  } catch {
    cachedFonts = [...FALLBACK_FONTS];
    return cachedFonts;
  }
}

async function listWindowsFonts(): Promise<string[]> {
  // 使用异步 execFile 替代 execSync，避免阻塞主进程事件循环
  const { stdout } = await execFileAsync(
    'powershell',
    ['-NoProfile', '-NonInteractive', '-command', 'Add-Type -AssemblyName System.Drawing; (New-Object System.Drawing.Text.InstalledFontCollection).Families.Name'],
    { encoding: 'utf-8', timeout: 10000, windowsHide: true }
  );
  return dedupeFonts(stdout.split('\n').map((line) => line.trim()).filter(Boolean));
}

async function listMacFonts(): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync('fc-list', [':', 'family'], { encoding: 'utf-8', timeout: 10000 });
    return parseFontconfig(stdout);
  } catch {
    const { stdout } = await execFileAsync('system_profiler', ['SPFontsDataType'], { encoding: 'utf-8', timeout: 10000 });
    return dedupeFonts(
      stdout.split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('Location:') && !line.startsWith('Type:') && !line.startsWith('Version:') && !line.startsWith('Valid:'))
    );
  }
}

async function listLinuxFonts(): Promise<string[]> {
  const { stdout } = await execFileAsync('fc-list', [':', 'family'], { encoding: 'utf-8', timeout: 10000 });
  return parseFontconfig(stdout);
}

function parseFontconfig(output: string): string[] {
  return dedupeFonts(
    output.split('\n')
      .map((line) => line.split(',')[0].trim())
      .filter(Boolean)
  );
}

function dedupeFonts(fonts: string[]): string[] {
  const unique = Array.from(new Set(fonts)).sort((a, b) => a.localeCompare(b, 'zh-CN'));
  if (unique.length === 0) return [...FALLBACK_FONTS];
  return unique;
}
