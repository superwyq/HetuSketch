import { registerAiIpc } from './ai.js';
import { registerAppIpc } from './app.js';
import { registerBooksIpc } from './books.js';
import { registerDesktopIpc } from './desktop.js';
import { registerEntriesIpc } from './entries.js';
import { registerProjectsIpc } from './projects.js';
import { registerSearchIpc } from './search.js';
import { registerSettingsIpc } from './settings.js';
import { registerSystemIpc } from './system.js';
import type { IpcRegistrationContext } from './types.js';

export function registerIpcHandlers(context: IpcRegistrationContext): void {
  registerAppIpc();
  registerSearchIpc(context);
  registerSettingsIpc(context);
  registerBooksIpc(context);
  registerProjectsIpc(context);
  registerEntriesIpc(context);
  registerAiIpc(context);
  registerSystemIpc(context);
  registerDesktopIpc();
}
