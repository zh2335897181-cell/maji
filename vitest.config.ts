import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/** 单元测试只覆盖纯逻辑与数据操作，不启动 Electron。 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'electron/**/*.test.ts'],
    css: false,
  },
});
