import { dialog, ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc.js';
import { ensureMainWindow } from '../windows/appWindows.js';
import type { IpcRegistrationContext } from './types.js';
import { asObject, asRequiredString, isProjectCreateInput } from './validators.js';

export function registerProjectsIpc({ storageService }: IpcRegistrationContext): void {
  ipcMain.handle(IPC_CHANNELS.projectsList, () => storageService.listProjects());
  ipcMain.handle(IPC_CHANNELS.projectsGet, (_event, projectId: unknown) => storageService.getProject(asRequiredString(projectId, 'projectId')));

  ipcMain.handle(IPC_CHANNELS.projectsCreate, async (_event, input: unknown) => {
    if (!isProjectCreateInput(input)) {
      throw new Error('Invalid project create payload');
    }

    return storageService.createProject(input);
  });

  ipcMain.handle(IPC_CHANNELS.projectsUpdate, async (_event, input: unknown) => storageService.updateProject(asObject(input)));
  ipcMain.handle(IPC_CHANNELS.projectsDelete, async (_event, projectId: unknown) => storageService.deleteProject(asRequiredString(projectId, 'projectId')));
  ipcMain.handle(IPC_CHANNELS.projectsExport, async (_event, projectId: unknown) => {
    const safeProjectId = asRequiredString(projectId, 'projectId');
    const project = storageService.getProject(safeProjectId);
    const target = await dialog.showSaveDialog(ensureMainWindow(), {
      title: '导出作品',
      defaultPath: `${project.id}.zip`,
      filters: [{ name: 'HetuSketch Project Zip', extensions: ['zip'] }]
    });
    if (target.canceled || !target.filePath) return undefined;
    const destinationPath = await storageService.exportProject(safeProjectId, target.filePath);
    return { projectId: safeProjectId, destinationPath };
  });
  ipcMain.handle(IPC_CHANNELS.projectsImportFolder, async () => {
    const target = await dialog.showOpenDialog(ensureMainWindow(), { title: '导入作品目录', properties: ['openDirectory'] });
    if (target.canceled || !target.filePaths[0]) return undefined;
    return storageService.importFromFolder(target.filePaths[0]);
  });
  ipcMain.handle(IPC_CHANNELS.projectsImportZip, async () => {
    const target = await dialog.showOpenDialog(ensureMainWindow(), { title: '导入作品 Zip', properties: ['openFile'], filters: [{ name: 'HetuSketch Project Zip', extensions: ['zip'] }] });
    if (target.canceled || !target.filePaths[0]) return undefined;
    return storageService.importFromZip(target.filePaths[0]);
  });
}
