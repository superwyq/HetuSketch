import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import AdmZip from 'adm-zip';
import { BrowserWindow, dialog, ipcMain } from 'electron';
import { IPC_CHANNELS, type ChapterExportInput, type ChapterExportItem } from '../../shared/ipc.js';
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
  ipcMain.handle(IPC_CHANNELS.chaptersSelectExportFolder, async (event) => {
    try {
      const owner = BrowserWindow.fromWebContents(event.sender);
      const options = {
        title: '选择章节导出文件夹',
        properties: ['openDirectory', 'createDirectory'] as Array<'openDirectory' | 'createDirectory'>
      };
      const target = owner && !owner.isDestroyed()
        ? await dialog.showOpenDialog(owner, options)
        : await dialog.showOpenDialog(options);
      return target.canceled ? undefined : target.filePaths[0];
    } catch (error) {
      throw new Error(`无法打开系统文件浏览器：${error instanceof Error ? error.message : '未知错误'}`);
    }
  });
  ipcMain.handle(IPC_CHANNELS.chaptersExport, async (_event, input: unknown) => exportChapters(asChapterExportInput(input)));
}

async function exportChapters(input: ChapterExportInput): Promise<{ destinationPath: string; fileCount: number }> {
  await mkdir(input.outputDirectory, { recursive: true });
  if (input.format === 'zip') {
    const destinationPath = join(input.outputDirectory, `导出内容_${timestampForFile()}.zip`);
    const zip = new AdmZip();
    input.chapters.forEach((chapter, index) => {
      zip.addFile(`${String(index + 1).padStart(3, '0')}_${safeFileName(chapter.title)}.md`, Buffer.from(formatChapterContent(chapter, 'markdown'), 'utf8'));
    });
    zip.writeZip(destinationPath);
    return { destinationPath, fileCount: input.chapters.length };
  }

  const format = input.format === 'markdown' ? 'markdown' : 'txt';
  const extension = format === 'markdown' ? 'md' : 'txt';
  const fileName = input.chapters.length === 1
    ? `${safeFileName(input.chapters[0].title)}.${extension}`
    : `导出内容_${timestampForFile()}.${extension}`;
  const destinationPath = join(input.outputDirectory, fileName);
  const content = input.chapters.map((chapter) => formatChapterContent(chapter, format)).join('\n\n');
  await writeFile(destinationPath, content, 'utf8');
  return { destinationPath, fileCount: 1 };
}

function asChapterExportInput(input: unknown): ChapterExportInput {
  const candidate = asObject<ChapterExportInput>(input);
  if (candidate.format !== 'markdown' && candidate.format !== 'txt' && candidate.format !== 'zip') {
    throw new Error('无效的导出格式');
  }
  if (typeof candidate.outputDirectory !== 'string' || !candidate.outputDirectory.trim()) {
    throw new Error('请选择导出文件夹');
  }
  if (!Array.isArray(candidate.chapters) || candidate.chapters.length === 0 || candidate.chapters.length > 100) {
    throw new Error('请选择 1 到 100 个章节进行导出');
  }
  return {
    format: candidate.format,
    outputDirectory: candidate.outputDirectory,
    chapters: candidate.chapters.map(asChapterExportItem)
  };
}

function asChapterExportItem(input: unknown): ChapterExportItem {
  const item = asObject<ChapterExportItem>(input);
  if (typeof item.title !== 'string' || !item.title.trim()) throw new Error('章节标题无效');
  if (typeof item.content !== 'string') throw new Error('章节内容无效');
  return {
    title: item.title.trim().slice(0, 160),
    content: item.content,
    order: typeof item.order === 'number' && Number.isFinite(item.order) ? item.order : 0
  };
}

function formatChapterContent(chapter: ChapterExportItem, format: 'markdown' | 'txt'): string {
  const content = chapter.content.replace(/\r\n/g, '\n');
  return format === 'markdown' ? `# ${chapter.title}\n\n${content}` : `${chapter.title}\n\n${content}`;
}

function safeFileName(input: string): string {
  return input.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 80) || '未命名章节';
}

function timestampForFile(): string {
  const now = new Date();
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}
