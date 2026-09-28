/* =============================================================================
   码迹 · 主窗口
   -----------------------------------------------------------------------------
   · 默认 1440x900，最小 1024x700，背景色用浅中性灰，避免加载瞬间闪白
   · 只在 ready-to-show 后显示窗口（配合 show: false）
   · 窗口尺寸记忆：UserSettings 里没有窗口相关字段，按交付说明跳过（不做额外设置项）
   · 安全相关的 setWindowOpenHandler / 权限策略统一在 index.ts 里设置，
     这样所有 webContents（包括将来新增的）都被同一条策略覆盖
   · 路径说明：tsconfig.electron.json 的 rootDir 是项目根，编译产物落在
     dist-electron/electron/main/ 下，所以运行时 __dirname 要向上三级才是项目根
     （这也是 package.json 的 main 指向 dist-electron/electron/main/index.js 的原因）
   ============================================================================= */

import { BrowserWindow } from 'electron';
import * as path from 'node:path';

/** 开发模式下由 npm run dev:electron 注入；打包后为空，走 dist/index.html */
const DEV_SERVER = process.env.MAJI_DEV_SERVER;

export interface MainWindowOptions {
  /** 页面加载完成后的回调（冒烟测试用） */
  onLoaded?: () => void;
}

export function createMainWindow(options: MainWindowOptions = {}): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    backgroundColor: '#f4f6f7',
    title: '码迹 · 编程学习笔记',
    icon: path.join(__dirname, '../../../build/icon.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      // 编译产物是 CommonJS：dist-electron/electron/preload/index.js
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
  });

  win.once('ready-to-show', () => win.show());
  if (options.onLoaded) win.webContents.once('did-finish-load', () => options.onLoaded?.());

  const loading = DEV_SERVER
    ? win.loadURL(DEV_SERVER)
    : win.loadFile(path.join(__dirname, '../../../dist/index.html'));
  void loading.catch((error: unknown) => {
    const reason = error instanceof Error ? error.message : String(error);
    process.stdout.write(`[maji] 页面加载失败：${reason}\n`);
  });

  return win;
}
