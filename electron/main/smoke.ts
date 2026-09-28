/* =============================================================================
   码迹 · 冒烟自检（仅在 MAJI_SMOKE_TEST 有值时启用）
   -----------------------------------------------------------------------------
   目的：没有人在键盘前也能验证“主进程 + preload + SQLite”这条链路是通的。
   流程（顺序固定）：
     a) 窗口加载完成 → 打印 [maji] window loaded
     b) 直接调用数据层做几件真实的事，每个操作打印一行
     c) 主动关闭首页窗口，验证没有编辑器监听时关闭握手也能完成
     d) 全部成功 → [maji] smoke ok 并以退出码 0 退出；
        任一步失败 → [maji] smoke failed: <原因> 并以退出码 1 退出
   注意：这里会真的写库（把示例笔记标题写成它自己、对复习项做一次 review-again），
   复习项会在同一个流程里被还原，所以数据库保持原样。
   ============================================================================= */

import { BrowserWindow, app } from 'electron';
import { isDueNow } from '../../src/lib/review';
import * as courses from './db/courses';
import * as library from './db/library';
import * as notes from './db/notes';

/** 窗口加载超时：dev server 没起来时不会一直挂着 */
const LOAD_TIMEOUT_MS = 20_000;
/** 退出前留给 stdout 冲刷日志的时间 */
const FLUSH_DELAY_MS = 150;

function log(line: string): void {
  process.stdout.write(`[maji] ${line}\n`);
}

/** 挂上自检；窗口加载完成或失败都会走到这里 */
export function armSmokeTest(win: BrowserWindow): void {
  let settled = false;
  const timer = setTimeout(() => finish(1, `窗口在 ${LOAD_TIMEOUT_MS / 1000} 秒内没有完成加载`), LOAD_TIMEOUT_MS);

  function finish(code: number, reason?: string): void {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    if (reason) log(`smoke failed: ${reason}`);
    else log('smoke ok');
    setTimeout(() => app.exit(code), FLUSH_DELAY_MS);
  }

  win.webContents.once('did-fail-load', (_event, code, description, url) => {
    finish(1, `页面加载失败（${code} ${description}）${url}`);
  });

  win.webContents.once('did-finish-load', () => {
    // 加载失败时 Electron 还会把错误页加载完并触发本事件，这里不再重复跑检查
    if (settled) return;
    log('window loaded');
    void check(win).then(
      () => finish(0),
      (error: unknown) => finish(1, error instanceof Error ? error.message : String(error)),
    );
  });
}

/** 渲染进程侧探测结果（preload 注入 + IPC 通道名 + 参数校验 + 数据库读取一次走通） */
interface BridgeProbe {
  error?: string;
  name?: string;
  version?: string;
  electron?: string;
  databasePath?: string;
  courses?: number;
  notes?: number;
  tags?: number;
  snippets?: number;
  exercises?: number;
  review?: number;
  theme?: string;
  updateState?: string;
  installGuard?: string;
}

const BRIDGE_SCRIPT = `(async () => {
  const maji = window.maji;
  if (!maji) return { error: 'window.maji 未注入' };
  try {
    const info = await maji.app.getInfo();
    const [courses, notes, tags, snippets, exercises, review, settings] = await Promise.all([
      maji.courses.list(), maji.notes.list(), maji.tags.list(), maji.snippets.list(),
      maji.exercises.list(), maji.review.list(), maji.settings.get(),
    ]);
    const unregisterSaveGuard = maji.app.onPrepareClose(async () => { throw new Error('smoke-save-guard'); });
    let installGuard = '';
    try { await maji.updates.install(); }
    catch (error) { installGuard = String(error); }
    unregisterSaveGuard();
    const updateStatus = await maji.updates.getStatus();
    const unsubscribe = maji.updates.onStatus(() => {});
    unsubscribe();
    return {
      name: info.name, version: info.version, electron: info.electronVersion,
      databasePath: info.databasePath,
      courses: courses.length, notes: notes.length, tags: tags.length,
      snippets: snippets.length, exercises: exercises.length, review: review.length,
      theme: settings.theme,
      updateState: updateStatus.state,
      installGuard,
    };
  } catch (error) {
    return { error: String(error && error.message ? error.message : error) };
  }
})()`;

async function check(win: BrowserWindow): Promise<void> {
  // 1) 走渲染进程真实调用一遍只读通道：验证 preload 注入与通道名两边一致
  const probe: unknown = await win.webContents.executeJavaScript(BRIDGE_SCRIPT);
  if (typeof probe !== 'object' || probe === null) throw new Error('preload 未注入 window.maji');
  const bridge = probe as BridgeProbe;
  if (bridge.error) throw new Error(`渲染进程调用 window.maji 失败：${bridge.error}`);
  if (bridge.updateState !== 'unsupported') throw new Error(`冒烟构建更新状态应为 unsupported，实际为 ${bridge.updateState}`);
  if (bridge.installGuard !== 'Error: smoke-save-guard') throw new Error(`更新安装前保存保护失效：${bridge.installGuard}`);
  log(`bridge app=${bridge.name ?? '?'} v${bridge.version ?? '?'} electron=${bridge.electron ?? '?'}`);
  log(`bridge db=${bridge.databasePath ?? '?'}`);
  log(
    `bridge courses=${bridge.courses} notes=${bridge.notes} tags=${bridge.tags} snippets=${bridge.snippets} exercises=${bridge.exercises} review=${bridge.review} theme=${bridge.theme}`,
  );

  // 2) 再直接调用数据层做几件真实的事（不经过 IPC）
  const courseList = courses.listCourses();
  const noteList = notes.listNotes();
  const reviewList = library.listReviewItems();
  log(
    `courses=${courseList.length} notes=${noteList.length} snippets=${library.listSnippets().length} exercises=${library.listExercises().length}`,
  );
  log(`review=${reviewList.length} due=${reviewList.filter((item) => isDueNow(item)).length}`);

  const note = notes.getNote('note_func_args');
  if (!note) throw new Error('示例笔记 note_func_args 不存在');
  log(`note=${note.id} title=${note.title} tags=${note.tags.join('/')}`);

  const hits = notes.searchNotes({ text: 'return' });
  if (hits.length === 0) throw new Error('搜索 return 没有结果');
  log(`search(return)=${hits.length} top=${hits[0]?.noteId ?? '-'}`);

  const updated = notes.updateNote(note.id, { title: note.title });
  log(`update=${updated.id} title=${updated.title} updatedAt=${updated.updatedAt}`);

  const before = reviewList.find((item) => item.id === 'review_param_arg');
  if (!before) throw new Error('复习知识点 review_param_arg 不存在');
  const after = library.applyReviewAction('review_param_arg', 'review-again');
  log(`review-again=${after.id} state=${after.state} count=${after.reviewCount}`);
  library.restoreReviewItem(before);
  log(`review restored state=${before.state} count=${before.reviewCount} dueAt=${before.dueAt ?? '-'}`);

  const settings = library.getSettings();
  log(
    `settings theme=${settings.theme} lastOpened=${settings.lastOpenedNoteId ?? '-'} recent=${settings.recentNoteIds.length}`,
  );

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('首页窗口关闭握手超时')), 3_000);
    win.once('closed', () => {
      clearTimeout(timeout);
      resolve();
    });
    win.close();
  });
  log('close handshake=ok');
}
