/* =============================================================================
   码迹 · 数据访问仓库接口
   -----------------------------------------------------------------------------
   界面只依赖 MajiRepository，不关心数据到底存在 SQLite 还是浏览器内存：
     · Electron 运行 → createIpcRepository(window.maji) 走主进程 SQLite
     · 浏览器 / Playwright / npm run dev → createLocalRepository() 走本地示例数据
   两种实现的行为由同一批纯函数（search / review / text）保证一致。
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
import type { MajiApi } from './ipc';

export interface MajiRepository {
  /** 数据来源说明，界面上用于提示“本地数据库 / 浏览器示例数据” */
  readonly source: 'sqlite' | 'local';
  listCourses(): Promise<Course[]>;
  createCourse(input: Partial<Course> & { name: string }): Promise<Course>;
  updateCourse(id: string, patch: Partial<Course>): Promise<Course>;
  deleteCourse(id: string): Promise<void>;
  reorderCourses(orderedIds: string[]): Promise<void>;

  listNotes(filter?: NoteListFilter): Promise<NoteSummary[]>;
  getNote(id: string): Promise<Note | null>;
  createNote(input: NoteInput): Promise<Note>;
  updateNote(id: string, patch: NotePatch): Promise<Note>;
  deleteNote(id: string): Promise<void>;
  touchNote(id: string): Promise<void>;
  searchNotes(query: SearchQuery): Promise<SearchResult[]>;

  listTags(): Promise<Tag[]>;

  listSnippets(limit?: number): Promise<CodeSnippet[]>;
  createSnippet(input: CodeSnippetInput): Promise<CodeSnippet>;

  listExercises(filter?: { courseId?: string; noteId?: string; limit?: number }): Promise<Exercise[]>;
  createExercise(input: ExerciseInput): Promise<Exercise>;
  toggleExercise(id: string, done: boolean): Promise<Exercise>;

  listReviewItems(filter?: { state?: string }): Promise<ReviewItemWithNote[]>;
  applyReviewAction(id: string, action: ReviewAction): Promise<ReviewItem>;

  getSettings(): Promise<UserSettings>;
  updateSettings(patch: Partial<UserSettings>): Promise<UserSettings>;
}

/** 把 preload 暴露的 API 适配成仓库接口（几乎是一一映射） */
export function createIpcRepository(api: MajiApi): MajiRepository {
  return {
    source: 'sqlite',
    listCourses: () => api.courses.list(),
    createCourse: (input) => api.courses.create(input),
    updateCourse: (id, patch) => api.courses.update(id, patch),
    deleteCourse: (id) => api.courses.remove(id),
    reorderCourses: (orderedIds) => api.courses.reorder(orderedIds),

    listNotes: (filter) => api.notes.list(filter),
    getNote: (id) => api.notes.get(id),
    createNote: (input) => api.notes.create(input),
    updateNote: (id, patch) => api.notes.update(id, patch),
    deleteNote: (id) => api.notes.remove(id),
    touchNote: (id) => api.notes.touch(id),
    searchNotes: (query) => api.notes.search(query),

    listTags: () => api.tags.list(),

    listSnippets: (limit) => api.snippets.list(limit),
    createSnippet: (input) => api.snippets.create(input),

    listExercises: (filter) => api.exercises.list(filter),
    createExercise: (input) => api.exercises.create(input),
    toggleExercise: (id, done) => api.exercises.toggle(id, done),

    listReviewItems: (filter) => api.review.list(filter),
    applyReviewAction: (id, action) => api.review.apply(id, action),

    getSettings: () => api.settings.get(),
    updateSettings: (patch) => api.settings.update(patch),
  };
}
