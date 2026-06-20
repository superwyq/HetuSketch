import { execSync } from 'node:child_process';
import { platform } from 'node:os';

const FALLBACK_FONTS = ['Microsoft YaHei', 'SimSun', 'SimHei', 'PingFang SC', 'Hiragino Sans GB', 'WenQuanYi Micro Hei', 'Arial', 'Times New Roman', 'Courier New'];

export function getSystemFonts(): string[] {
  try {
    const os = platform();
    if (os === 'win32') {
      return listWindowsFonts();
    }
    if (os === 'darwin') {
      return listMacFonts();
    }
    return listLinuxFonts();
  } catch {
    return [...FALLBACK_FONTS];
  }
}

function listWindowsFonts(): string[] {
  const command = 'powershell -command "Add-Type -AssemblyName System.Drawing; (New-Object System.Drawing.Text.InstalledFontCollection).Families.Name"';
  const output = execSync(command, { encoding: 'utf-8', timeout: 10000 });
  return dedupeFonts(output.split('\n').map((line) => line.trim()).filter(Boolean));
}

function listMacFonts(): string[] {
  try {
    const output = execSync('fc-list : family', { encoding: 'utf-8', timeout: 10000 });
    return parseFontconfig(output);
  } catch {
    const output = execSync('system_profiler SPFontsDataType', { encoding: 'utf-8', timeout: 10000 });
    return dedupeFonts(
      output.split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('Location:') && !line.startsWith('Type:') && !line.startsWith('Version:') && !line.startsWith('Valid:'))
    );
  }
}

function listLinuxFonts(): string[] {
  const output = execSync('fc-list : family', { encoding: 'utf-8', timeout: 10000 });
  return parseFontconfig(output);
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
