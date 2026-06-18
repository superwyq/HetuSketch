import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer/src'),
      '@shared': resolve(__dirname, 'src/shared'),
      electron: resolve(__dirname, 'src/main/test/electronMock.ts'),
      'better-sqlite3': resolve(__dirname, 'src/main/test/betterSqlite3Mock.ts'),
      'adm-zip': resolve(__dirname, 'src/main/test/admZipMock.ts'),
      chokidar: resolve(__dirname, 'src/main/test/chokidarMock.ts')
    }
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/renderer/test/setup.ts',
    globals: true,
    server: {
      deps: {
        external: ['chokidar', 'adm-zip']
      }
    }
  }
});
