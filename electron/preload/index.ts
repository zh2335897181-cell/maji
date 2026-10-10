/* =============================================================================
   码迹 · preload
   -----------------------------------------------------------------------------
   只做一件事：把白名单通道包装成 window.maji，类型与 src/lib/ipc.ts 的 MajiApi
   完全一致（类型对不上会在编译期报错）。
   · 绝不暴露 ipcRenderer 本身，渲染进程也无法自己拼通道名
   · 运行在 contextIsolation + sandbox 下，这里没有文件系统 / SQLite 能力
   · 通道名为什么内联：webPreferences.sandbox = true 时 preload 的 require 只支持
     electron / events / timers / url 这几个模块，连相对路径的项目文件都会报
     “module not found: ../../src/lib/ipc”。所以这里内联一份通道名；
     IPC 只在类型位置使用，编译时会被完全剔除（dist-electron 里不会有这条 require），
     编译器会逐字核对下面的键与值是否与 src/lib/ipc.ts 一致。
     这条性质由冒烟自检兜底：preload 一旦加载失败，window.maji 就不存在。
   ============================================================================= */

import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../../src/lib/ipc';
import type { AIAction, AIContext, AIProviderSettings, AIResult, AISettingsStatus, AppInfo, ExportResult, MajiApi } from '../../src/lib/ipc';
import type { UpdateStatus } from '../../src/lib/ipc';
import type {
  CodeSnippet,
  CodeSnippetInput,
  Course,
  Exercise,
  ExerciseInput,
  Note,
  NoteInput,
  NoteListFilter,
  NotePatch,
  NoteSummary,
  ReviewAction,
  ReviewItem,
  ReviewItemWithNote,
  ReviewQuestion,
  ReviewQuestionAnswerInput,
  ReviewQuestionGradeInput,
  ReviewSessionFilter,
  ReviewSessionInput,
  ReviewSessionPatch,
  ReviewSessionSummary,
  ReviewSessionWithQuestions,
  SearchQuery,
  SearchResult,
  Tag,
  UserSettings,
} from '../../src/lib/types';

/** 通道名必须与 src/lib/ipc.ts 的 IPC 常量表逐字一致：键和值都由编译器核对 */
const CHANNELS: { [K in keyof typeof IPC]: (typeof IPC)[K] } = {
  backupStatus: 'maji:backup:status',
  backupEnabled: 'maji:backup:enabled',
  backupExport: 'maji:backup:export',
  backupPreview: 'maji:backup:preview',
  backupRestore: 'maji:backup:restore',
  backupDirectory: 'maji:backup:directory',
  morningNotesList: 'maji:morning-notes:list',
  morningNotesCreate: 'maji:morning-notes:create',
  morningNotesUpdate: 'maji:morning-notes:update',
  mindMapsList: 'maji:mindmaps:list',
  mindMapsSave: 'maji:mindmaps:save',
  mindMapsRemove: 'maji:mindmaps:remove',
  mindMapsPreview: 'maji:mindmaps:preview',
  mindMapsGenerate: 'maji:mindmaps:generate',
  mindMapsCancel: 'maji:mindmaps:cancel',
  mindMapsGetView: 'maji:mindmaps:get-view',
  mindMapsSaveView: 'maji:mindmaps:save-view',
  mindMapsExport: 'maji:mindmaps:export',
  appInfo: 'maji:app:info',
  appPrepareClose: 'maji:app:prepare-close',
  appCloseReady: 'maji:app:close-ready',
  updatesCheck: 'maji:updates:check',
  updatesInstall: 'maji:updates:install',
  updatesStatusGet: 'maji:updates:status-get',
  updatesStatus: 'maji:updates:status',
  coursesList: 'maji:courses:list',
  coursesCreate: 'maji:courses:create',
  coursesUpdate: 'maji:courses:update',
  coursesDelete: 'maji:courses:delete',
  coursesReorder: 'maji:courses:reorder',
  notesList: 'maji:notes:list',
  notesGet: 'maji:notes:get',
  notesCreate: 'maji:notes:create',
  notesUpdate: 'maji:notes:update',
  notesDelete: 'maji:notes:delete',
  notesTouch: 'maji:notes:touch',
  notesSearch: 'maji:notes:search',
  tagsList: 'maji:tags:list',
  snippetsList: 'maji:snippets:list',
  snippetsCreate: 'maji:snippets:create',
  exercisesList: 'maji:exercises:list',
  exercisesCreate: 'maji:exercises:create',
  exercisesToggle: 'maji:exercises:toggle',
  reviewList: 'maji:review:list',
  reviewApply: 'maji:review:apply',
  reviewSessionsList: 'maji:review-sessions:list',
  reviewSessionsGet: 'maji:review-sessions:get',
  reviewSessionsCreate: 'maji:review-sessions:create',
  reviewSessionsUpdate: 'maji:review-sessions:update',
  reviewSessionsSaveAnswer: 'maji:review-sessions:save-answer',
  reviewSessionsSaveGrade: 'maji:review-sessions:save-grade',
  settingsGet: 'maji:settings:get',
  settingsUpdate: 'maji:settings:update',
  exportMarkdown: 'maji:file:export-markdown',
  openExternal: 'maji:shell:open-external',
  aiSettingsGet: 'maji:ai:settings-get',
  aiSettingsSave: 'maji:ai:settings-save',
  aiSettingsClearKey: 'maji:ai:settings-clear-key',
  aiTestConnection: 'maji:ai:test-connection',
  aiAsk: 'maji:ai:ask',
  aiReviewGenerate: 'maji:ai:review-generate',
  aiReviewGrade: 'maji:ai:review-grade',
};

/** 通道名只能来自上面的常量表，调用方无法传入任意通道 */
function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  return (ipcRenderer.invoke(channel, ...args) as Promise<T>).catch((error: unknown) => {
    if (!(error instanceof Error)) throw error;
    const message = error.message.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, '');
    throw new Error(message || '操作失败，请重试');
  });
}

const prepareCloseHandlers = new Set<() => Promise<void>>();
let restored = false;
async function saveForBackup<T>(operation: () => Promise<T>, restore = false): Promise<T> {
  const previous = document.body.inert;
  document.body.inert = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.all([...prepareCloseHandlers].map(handler => Promise.resolve().then(handler))),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('保存等待超时，请先手动保存后重试')), 30000); }),
    ]);
    if (localStorage.getItem('maji:mindmap-recovery:preview')) throw new Error('有尚未保存的思维导图预览，请先保存或放弃预览后重试');
    const result = await operation();
    if (restore) {
      restored = true;
      prepareCloseHandlers.clear();
      try {
        for (const key of Object.keys(localStorage)) {
          if (/^maji:(morning-draft:|mindmap-recovery:|note-draft:)/.test(key) || key === 'maji:mindmap-review-preset') localStorage.removeItem(key);
        }
      } finally { window.location.reload(); }
    }
    return result;
  } finally { clearTimeout(timer); if (!restored) document.body.inert = previous; }
}

// Always acknowledge a close request, even on pages with no editor mounted.
ipcRenderer.on(CHANNELS.appPrepareClose, () => {
  const handlers = [...prepareCloseHandlers];
  void Promise.all(handlers.map((handler) => Promise.resolve().then(handler))).then(
    () => ipcRenderer.send(CHANNELS.appCloseReady, { ok: true }),
    (error: unknown) =>
      ipcRenderer.send(CHANNELS.appCloseReady, {
        ok: false,
        error: error instanceof Error ? error.message : '笔记保存失败',
      }),
  );
});

const api: MajiApi = {
  backup: {
    status: () => invoke(CHANNELS.backupStatus),
    setEnabled: value => invoke(CHANNELS.backupEnabled, value),
    export: () => saveForBackup(() => invoke(CHANNELS.backupExport)),
    preview: () => saveForBackup(() => invoke(CHANNELS.backupPreview)),
    restore: token => saveForBackup(() => invoke(CHANNELS.backupRestore, token), true),
    openDirectory: () => invoke(CHANNELS.backupDirectory),
  },
  morningNotes: {
    list: () => invoke(CHANNELS.morningNotesList),
    create: input => invoke(CHANNELS.morningNotesCreate, input),
    update: (id, input, revision) => invoke(CHANNELS.morningNotesUpdate, id, input, revision),
  },
  mindMaps: {
    list: () => invoke(CHANNELS.mindMapsList),
    save: (draft, id, revision) => invoke(CHANNELS.mindMapsSave, draft, id, revision),
    remove: (id) => invoke(CHANNELS.mindMapsRemove, id),
    preview: (ids) => invoke(CHANNELS.mindMapsPreview, ids),
    generate: (input) => invoke(CHANNELS.mindMapsGenerate, input),
    cancel: (id) => invoke(CHANNELS.mindMapsCancel, id),
    getView: (id) => invoke(CHANNELS.mindMapsGetView, id),
    saveView: (id, view) => invoke(CHANNELS.mindMapsSaveView, id, view),
    exportFile: (name, format, content) => invoke(CHANNELS.mindMapsExport, name, format, content),
  },
  app: {
    getInfo: () => invoke<AppInfo>(CHANNELS.appInfo),
    onPrepareClose: (handler) => {
      prepareCloseHandlers.add(handler);
      return () => prepareCloseHandlers.delete(handler);
    },
  },
  updates: {
    check: () => invoke<void>(CHANNELS.updatesCheck),
    install: async () => {
      const results = await Promise.allSettled(
        [...prepareCloseHandlers].map((handler) => Promise.resolve().then(handler)),
      );
      const failure = results.find((result) => result.status === 'rejected');
      if (failure?.status === 'rejected') throw failure.reason;
      await invoke<void>(CHANNELS.updatesInstall);
    },
    getStatus: () => invoke<UpdateStatus>(CHANNELS.updatesStatusGet),
    onStatus: (handler) => {
      const listener = (_event: Electron.IpcRendererEvent, status: UpdateStatus): void => handler(status);
      ipcRenderer.on(CHANNELS.updatesStatus, listener);
      return () => ipcRenderer.removeListener(CHANNELS.updatesStatus, listener);
    },
  },
  courses: {
    list: () => invoke<Course[]>(CHANNELS.coursesList),
    create: (input: Partial<Course> & { name: string }) =>
      invoke<Course>(CHANNELS.coursesCreate, input),
    update: (id: string, patch: Partial<Course>) =>
      invoke<Course>(CHANNELS.coursesUpdate, id, patch),
    remove: (id: string) => invoke<void>(CHANNELS.coursesDelete, id),
    reorder: (orderedIds: string[]) => invoke<void>(CHANNELS.coursesReorder, orderedIds),
  },
  notes: {
    list: (filter?: NoteListFilter) => invoke<NoteSummary[]>(CHANNELS.notesList, filter ?? {}),
    get: (id: string) => invoke<Note | null>(CHANNELS.notesGet, id),
    create: (input: NoteInput) => invoke<Note>(CHANNELS.notesCreate, input),
    update: (id: string, patch: NotePatch) => invoke<Note>(CHANNELS.notesUpdate, id, patch),
    remove: (id: string) => invoke<void>(CHANNELS.notesDelete, id),
    touch: (id: string) => invoke<void>(CHANNELS.notesTouch, id),
    search: (query: SearchQuery) => invoke<SearchResult[]>(CHANNELS.notesSearch, query),
  },
  tags: {
    list: () => invoke<Tag[]>(CHANNELS.tagsList),
  },
  snippets: {
    list: (limit?: number) => invoke<CodeSnippet[]>(CHANNELS.snippetsList, limit ?? null),
    create: (input: CodeSnippetInput) => invoke<CodeSnippet>(CHANNELS.snippetsCreate, input),
  },
  exercises: {
    list: (filter?: { courseId?: string; noteId?: string; limit?: number }) =>
      invoke<Exercise[]>(CHANNELS.exercisesList, filter ?? {}),
    create: (input: ExerciseInput) => invoke<Exercise>(CHANNELS.exercisesCreate, input),
    toggle: (id: string, done: boolean) => invoke<Exercise>(CHANNELS.exercisesToggle, id, done),
  },
  review: {
    list: (filter?: { state?: string }) =>
      invoke<ReviewItemWithNote[]>(CHANNELS.reviewList, filter ?? {}),
    apply: (id: string, action: ReviewAction) =>
      invoke<ReviewItem>(CHANNELS.reviewApply, id, action),
  },
  reviewSessions: {
    list: (filter?: ReviewSessionFilter) =>
      invoke<ReviewSessionSummary[]>(CHANNELS.reviewSessionsList, filter ?? {}),
    get: (id: string) => invoke<ReviewSessionWithQuestions | null>(CHANNELS.reviewSessionsGet, id),
    create: (input: ReviewSessionInput) =>
      invoke<ReviewSessionWithQuestions>(CHANNELS.reviewSessionsCreate, input),
    update: (id: string, patch: ReviewSessionPatch) =>
      invoke<ReviewSessionWithQuestions>(CHANNELS.reviewSessionsUpdate, id, patch),
    saveAnswer: (sessionId: string, input: ReviewQuestionAnswerInput) =>
      invoke<ReviewQuestion>(CHANNELS.reviewSessionsSaveAnswer, sessionId, input),
    saveGrade: (sessionId: string, input: ReviewQuestionGradeInput) =>
      invoke<ReviewQuestion>(CHANNELS.reviewSessionsSaveGrade, sessionId, input),
  },
  settings: {
    get: () => invoke<UserSettings>(CHANNELS.settingsGet),
    update: (patch: Partial<UserSettings>) =>
      invoke<UserSettings>(CHANNELS.settingsUpdate, patch),
  },
  files: {
    exportMarkdown: (suggestedName: string, content: string) =>
      invoke<ExportResult>(CHANNELS.exportMarkdown, suggestedName, content),
  },
  external: {
    open: (url: string) => invoke<void>(CHANNELS.openExternal, url),
  },
  ai: {
    getSettings: () => invoke<AISettingsStatus>(CHANNELS.aiSettingsGet),
    saveSettings: (settings: AIProviderSettings, apiKey?: string) =>
      invoke<AISettingsStatus>(CHANNELS.aiSettingsSave, settings, apiKey),
    clearKey: () => invoke<AISettingsStatus>(CHANNELS.aiSettingsClearKey),
    testConnection: (settings?: AIProviderSettings, apiKey?: string) =>
      invoke<void>(CHANNELS.aiTestConnection, ...(settings ? [settings, apiKey] : [])),
    ask: (action: AIAction, context: AIContext) =>
      invoke<AIResult>(CHANNELS.aiAsk, action, context),
    review: {
      generate: (input) => invoke(CHANNELS.aiReviewGenerate, input),
      grade: (input) => invoke(CHANNELS.aiReviewGrade, input),
    },
  },
};

contextBridge.exposeInMainWorld('maji', api);
