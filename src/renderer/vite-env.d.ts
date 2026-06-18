/// <reference types="vite/client" />

import type { HetuSketchApi } from '@shared/ipc';

declare global {
  interface Window {
    hetuSketch: HetuSketchApi;
  }
}

export {};
