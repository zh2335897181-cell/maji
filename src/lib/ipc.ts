/* =============================================================================
   码迹 · IPC 契约
   -----------------------------------------------------------------------------
   preload 通过 contextBridge 暴露 window.maji，类型即 MajiApi。
   渲染进程只能调用这里列出的方法，无法访问 Node / 文件系统 / SQLite。
   每个通道在主进程都会做参数校验（见 electron/main/ipc/validate.ts）。
   ============================================================================= */

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
  SearchQuery,
  SearchResult,
  Tag,
  UserSettings,
} from './types';

/** 通道名集中定义，避免字符串散落各处 */
export const IPC = {
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
  settingsGet: 'maji:settings:get',
  settingsUpdate: 'maji:settings:update',
  exportMarkdown: 'maji:file:export-markdown',
  openExternal: 'maji:shell:open-external',
  aiSettingsGet: 'maji:ai:settings-get',
  aiSettingsSave: 'maji:ai:settings-save',
  aiSettingsClearKey: 'maji:ai:settings-clear-key',
  aiTestConnection: 'maji:ai:test-connection',
  aiAsk: 'maji:ai:ask',
} as const;

export interface AppInfo {
  name: string;
  version: string;
  platform: string;
  /** 数据库文件位置，用于“关于”面板展示，渲染进程仅做展示 */
  databasePath: string;
  electronVersion: string;
}

export interface ExportResult {
  saved: boolean;
  /** 取消保存时为 undefined */
  path?: string;
}

export interface AIProviderSettings {
  baseUrl: string;
  model: string;
}
export interface AISettingsStatus extends AIProviderSettings {
  configured: boolean;
  keyPresent: boolean;
}
export type AIAction = 'explain' | 'organize' | 'exercise';
export interface AIContext {
  selectedText: string;
  noteText?: string;
  scope: 'selection' | 'note';
  language: import('./types').LanguageId;
}
export type AIResult =
  | { kind: 'text'; text: string }
  | { kind: 'exercise'; title: string; prompt: string; hint: string; solution: string };

export type UpdateStatus =
  | { state: 'unsupported'; currentVersion: string; message: string }
  | { state: 'idle'; currentVersion: string }
  | { state: 'checking'; currentVersion: string }
  | { state: 'latest'; currentVersion: string }
  | { state: 'available'; currentVersion: string; version: string }
  | { state: 'downloading'; currentVersion: string; version: string; percent: number }
  | { state: 'downloaded'; currentVersion: string; version: string }
  | { state: 'error'; currentVersion: string; message: string };

/**
 * window.maji 的形状。所有方法都是 Promise，失败时 reject 一个可读的错误。
 */
export interface MajiApi {
  app: {
    getInfo(): Promise<AppInfo>;
    onPrepareClose(handler: () => Promise<void>): () => void;
  };
  updates: {
    check(): Promise<void>;
    install(): Promise<void>;
    getStatus(): Promise<UpdateStatus>;
    onStatus(handler: (status: UpdateStatus) => void): () => void;
  };
  courses: {
    list(): Promise<Course[]>;
    create(input: Partial<Course> & { name: string }): Promise<Course>;
    update(id: string, patch: Partial<Course>): Promise<Course>;
    /** 仅允许删除没有笔记的课程 */
    remove(id: string): Promise<void>;
    reorder(orderedIds: string[]): Promise<void>;
  };
  notes: {
    list(filter?: NoteListFilter): Promise<NoteSummary[]>;
    get(id: string): Promise<Note | null>;
    create(input: NoteInput): Promise<Note>;
    update(id: string, patch: NotePatch): Promise<Note>;
    remove(id: string): Promise<void>;
    touch(id: string): Promise<void>;
    search(query: SearchQuery): Promise<SearchResult[]>;
  };
  tags: {
    list(): Promise<Tag[]>;
  };
  snippets: {
    list(limit?: number): Promise<CodeSnippet[]>;
    create(input: CodeSnippetInput): Promise<CodeSnippet>;
  };
  exercises: {
    list(filter?: { courseId?: string; noteId?: string; limit?: number }): Promise<Exercise[]>;
    create(input: ExerciseInput): Promise<Exercise>;
    toggle(id: string, done: boolean): Promise<Exercise>;
  };
  review: {
    list(filter?: { state?: string }): Promise<ReviewItemWithNote[]>;
    apply(id: string, action: ReviewAction): Promise<ReviewItem>;
  };
  settings: {
    get(): Promise<UserSettings>;
    update(patch: Partial<UserSettings>): Promise<UserSettings>;
  };
  files: {
    exportMarkdown(suggestedName: string, content: string): Promise<ExportResult>;
  };
  external: {
    /** 仅允许 https / http，由主进程再次校验 */
    open(url: string): Promise<void>;
  };
  ai: {
    getSettings(): Promise<AISettingsStatus>;
    saveSettings(settings: AIProviderSettings, apiKey?: string): Promise<AISettingsStatus>;
    clearKey(): Promise<AISettingsStatus>;
    testConnection(settings?: AIProviderSettings, apiKey?: string): Promise<void>;
    ask(action: AIAction, context: AIContext): Promise<AIResult>;
  };
}

declare global {
  interface Window {
    /** 仅在 Electron 中由 preload 注入；浏览器开发模式下为 undefined */
    maji?: MajiApi;
  }
}
