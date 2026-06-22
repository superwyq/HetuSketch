import type { StorageService } from '../services/storageService.js';

export interface IpcRegistrationContext {
  storageService: StorageService;
}
