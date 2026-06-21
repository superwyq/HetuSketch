import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        output: {
          format: 'cjs',
          entryFileNames: '[name].js'
        }
      }
    },
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared')
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react()],
    resolve: {
      alias: {
        '@renderer': resolve(__dirname, 'src/renderer'),
        '@shared': resolve(__dirname, 'src/shared')
      }
    },
    build: {
      // 产物分块：将第三方依赖拆为独立 vendor chunk，改善缓存命中与并行加载
      rollupOptions: {
        output: {
          manualChunks(id): string | undefined {
            if (!id.includes('node_modules/')) return undefined;
            // antd 与 @ant-design/icons 紧耦合（互相引用），合并到同一 chunk 避免循环依赖
            if (id.includes('node_modules/@ant-design/icons') || id.includes('node_modules/antd/') || id.includes('node_modules/@ant-design/css') || id.includes('node_modules/@rc-component') || /node_modules\/rc-/i.test(id)) return 'vendor-antd';
            if (id.includes('node_modules/react-router')) return 'vendor-router';
            if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/') || id.includes('node_modules/scheduler')) return 'vendor-react';
            if (id.includes('node_modules/zustand')) return 'vendor-zustand';
            return undefined;
          }
        }
      },
      chunkSizeWarningLimit: 1024
    }
  }
});
