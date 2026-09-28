import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * 渲染进程构建配置。
 * 端口固定为 5199，Electron 主进程在开发模式下加载该地址。
 * base 使用相对路径，打包后由 file:// 协议加载。
 */
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5199,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome126',
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        // 把高亮引擎与编辑器拆成独立 chunk，首屏只加载界面所需代码
        manualChunks(id: string) {
          if (id.includes('node_modules/shiki') || id.includes('node_modules/@shikijs')) {
            return 'shiki';
          }
          if (id.includes('node_modules/@tiptap') || id.includes('node_modules/prosemirror')) {
            return 'editor';
          }
          return undefined;
        },
      },
    },
  },
});
