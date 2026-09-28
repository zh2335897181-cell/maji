/* =============================================================================
   码迹 · Electron 主进程入口
   -----------------------------------------------------------------------------
   启动顺序：打开数据库（迁移 + 空库播种）→ 安全策略 → 注册 IPC → 创建窗口
   · 数据库打不开（原生模块 ABI 不匹配、磁盘不可写等）时弹中文错误框并退出，
     绝不留下一个空白窗口
   · 菜单整体关闭（Menu.setApplicationMenu(null)）：应用内已有全部入口，
     中文系统菜单不属于本期范围
   · MAJI_SMOKE_TEST 有值时交给 smoke.ts 做无人值守自检
   ============================================================================= */

import { BrowserWindow, Menu, app, dialog, ipcMain, session, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import * as path from 'node:path';
import { IPC } from '../../src/lib/ipc';
import { closeDatabase, openDatabase } from './db/connection';
import { registerIpcHandlers } from './ipc/handlers';
import { armSmokeTest } from './smoke';
import { createMainWindow } from './window';
import { createUpdateService, type UpdateUpdater } from './updates';

/** 开发模式下由 npm run dev:electron 注入 */
const DEV_SERVER = process.env.MAJI_DEV_SERVER;
const SMOKE_TEST = Boolean(process.env.MAJI_SMOKE_TEST);
const CLOSE_SAVE_TIMEOUT_MS = 15_000;

interface CloseGuardState {
  allowed: boolean;
  awaitingRenderer: boolean;
  timeout: ReturnType<typeof setTimeout> | null;
}

const closeGuards = new WeakMap<BrowserWindow, CloseGuardState>();

const REBUILD_HINT =
  '如果提示原生模块加载失败，请在项目目录执行下面的命令重新编译后再启动：\n  npx @electron/rebuild -f -w better-sqlite3';

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * 致命错误统一出口。
 * 注意：dialog.showErrorBox 在 Windows 上是模态的，会一直阻塞主进程；
 * 冒烟自检没有人在场，这种情况下只打日志并退出，避免“卡住”而不是“失败”。
 */
function reportFatal(title: string, message: string): void {
  process.stdout.write(`[maji] fatal: ${message.replace(/\s*\n\s*/g, ' ')}\n`);
  if (!SMOKE_TEST) dialog.showErrorBox(title, message);
  app.exit(1);
}

function databaseFile(): string {
  return path.join(app.getPath('userData'), 'maji.db');
}

function hasConfiguredUpdateFeed(): boolean {
  try {
    const manifest = require(path.join(app.getAppPath(), 'package.json')) as {
      majiUpdateRepository?: unknown;
    };
    return (
      typeof manifest.majiUpdateRepository === 'string' &&
      /^zh2335897181-cell\/[A-Za-z0-9_.-]+$/.test(manifest.majiUpdateRepository)
    );
  } catch {
    return false;
  }
}

/** 只允许 https / http 交给系统浏览器；file:、javascript:、data: 等一律拒绝 */
function isSafeExternalUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

/** 应用自身地址：开发时是 Vite dev server，打包后是 file:// 下的 dist/index.html */
function isAppUrl(url: string): boolean {
  if (!DEV_SERVER) return url.startsWith('file://');
  try {
    return new URL(url).origin === new URL(DEV_SERVER).origin;
  } catch {
    return false;
  }
}

function applySecurityPolicies(): void {
  app.on('web-contents-created', (_event, contents) => {
    // 不允许开新窗口；其中的 http(s) 链接转交系统浏览器，其余（file: / javascript: / data: / 自定义协议）直接丢弃
    contents.setWindowOpenHandler(({ url }) => {
      if (isSafeExternalUrl(url)) {
        void shell.openExternal(url).catch((error: unknown) => {
          process.stdout.write(`[maji] 打开外部链接失败：${describe(error)}\n`);
        });
      }
      return { action: 'deny' };
    });
    // 禁止把页面导航到应用之外的地址
    contents.on('will-navigate', (event, url) => {
      if (!isAppUrl(url)) event.preventDefault();
    });
    contents.on('will-attach-webview', (event) => event.preventDefault());
  });

  // 摄像头、麦克风、通知、地理位置等权限本应用一律不需要
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false),
  );
  session.defaultSession.setPermissionCheckHandler(() => false);
}

/** 等待渲染进程把当前笔记写入 SQLite 后再关闭窗口，避免丢掉最后一段输入。 */
function guardWindowClose(win: BrowserWindow): void {
  const state: CloseGuardState = { allowed: false, awaitingRenderer: false, timeout: null };
  closeGuards.set(win, state);

  win.on('close', (event) => {
    if (state.allowed) return;
    event.preventDefault();
    if (state.awaitingRenderer) return;

    state.awaitingRenderer = true;
    state.timeout = setTimeout(() => {
      state.awaitingRenderer = false;
      state.timeout = null;
      void dialog.showMessageBox(win, {
        type: 'warning',
        title: '保存尚未完成',
        message: '码迹还没有收到保存确认，窗口已保持打开。',
        detail: '请稍等片刻后再关闭；如果持续出现，请先复制未保存的内容。',
        buttons: ['知道了'],
      });
    }, CLOSE_SAVE_TIMEOUT_MS);
    win.webContents.send(IPC.appPrepareClose);
  });
}

ipcMain.on(IPC.appCloseReady, (event, result: unknown) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  const state = closeGuards.get(win);
  if (!state?.awaitingRenderer) return;

  if (state.timeout) clearTimeout(state.timeout);
  state.timeout = null;
  state.awaitingRenderer = false;

  if (typeof result === 'object' && result !== null && 'ok' in result && result.ok === true) {
    state.allowed = true;
    win.close();
    return;
  }

  const reason =
    typeof result === 'object' && result !== null && 'error' in result && typeof result.error === 'string'
      ? result.error.slice(0, 500)
      : '无法确认笔记是否已保存。';
  void dialog.showMessageBox(win, {
    type: 'error',
    title: '笔记保存失败',
    message: '码迹没有关闭窗口，以免丢失未保存的修改。',
    detail: reason,
    buttons: ['返回继续编辑'],
  });
});

function bootstrap(): void {
  try {
    openDatabase(databaseFile());
  } catch (error) {
    reportFatal('码迹无法启动', `本地数据库打开失败，应用无法继续运行。\n\n${describe(error)}\n\n${REBUILD_HINT}`);
    return;
  }

  applySecurityPolicies();
  Menu.setApplicationMenu(null);
  const updates = createUpdateService(autoUpdater as unknown as UpdateUpdater, {
    isPackaged: app.isPackaged && !SMOKE_TEST,
    platform: process.platform,
    hasFeed: hasConfiguredUpdateFeed(),
    currentVersion: app.getVersion(),
  });
  updates.subscribe((status) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
        win.webContents.send(IPC.updatesStatus, status);
      }
    }
  });
  registerIpcHandlers(updates);

  const openWindow = (): BrowserWindow => {
    const win = createMainWindow();
    guardWindowClose(win);
    if (SMOKE_TEST) armSmokeTest(win);
    win.webContents.once('did-finish-load', () => {
      if (!SMOKE_TEST && updates.getStatus().state !== 'unsupported') {
        setTimeout(() => void updates.checkForUpdates(), 3_000);
      }
    });
    return win;
  };
  openWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) openWindow();
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('will-quit', () => closeDatabase());

// 未捕获异常：打印清楚的原因并退出，不让 Electron 弹出会阻塞主进程的模态错误框
process.on('uncaughtException', (error: Error) => {
  reportFatal('码迹运行出错', `主进程遇到未捕获的异常，应用即将退出。\n\n${describe(error)}`);
});

app
  .whenReady()
  .then(bootstrap)
  .catch((error: unknown) => {
    reportFatal('码迹无法启动', `主进程启动失败：${describe(error)}`);
  });
