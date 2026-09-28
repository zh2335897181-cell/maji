import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env.MAJI_E2E_BASE_URL ?? 'http://127.0.0.1:5199';

/**
 * 关键界面流程测试。
 * 两种目标窗口尺寸分别对应设计稿要求：1440×900 与 1280×800。
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 7_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // 直接使用本机安装的 Chrome，避免额外下载浏览器内核
    channel: 'chrome',
  },
  projects: [
    {
      name: 'desktop-1440x900',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'laptop-1280x800',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
