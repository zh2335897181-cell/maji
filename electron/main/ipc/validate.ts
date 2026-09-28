/* =============================================================================
   码迹 · IPC 参数校验（纯函数，不碰 IO，便于单测）
   -----------------------------------------------------------------------------
   渲染进程传来的一切都当成不可信输入：
   · id 必须匹配 /^[a-z]+_[A-Za-z0-9_-]{1,64}$/（note_func_args / note_ab12cd34）
   · 文本字段按用途限长，数组限个数
   · 枚举（语言 / 配色 / 图标 / 复习操作 / 难度 / 主题）对着白名单逐个检查
   失败一律抛出可直接展示给用户的中文 Error。
   ============================================================================= */

import type {
  CodeSnippetInput,
  Course,
  CourseColorKey,
  ExerciseDifficulty,
  ExerciseInput,
  LanguageId,
  NoteInput,
  NoteListFilter,
  NotePatch,
  ReviewAction,
  SearchQuery,
  UserSettings,
} from '../../../src/lib/types';
import {
  COURSE_COLOR_KEYS,
  COURSE_ICON_KEYS,
  COURSE_TRACK_IDS,
  EDITOR_FONT_FAMILIES,
  EXERCISE_DIFFICULTIES,
  LANGUAGE_IDS,
  REVIEW_ACTIONS,
  REVIEW_STATES,
  THEME_MODES,
  isOneOf,
} from '../db/mappers';

const ID_PATTERN = /^[a-z]+_[A-Za-z0-9_-]{1,64}$/;

const MAX_TITLE = 200;
const MAX_BODY = 2_000_000;
const MAX_CODE = 500_000;
const MAX_TAG = 40;
const MAX_TAGS = 20;
const MAX_SHORT = 2000;
const MAX_SNIPPET_NAME = 120;
const MAX_LIMIT = 500;
const MAX_RECENT_NOTES = 6;

/* ------------------------------------------------------------ 基础类型 */

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label}格式不正确`);
  }
  return value as Record<string, unknown>;
}

/** 可选对象参数：undefined / null 视为“没传” */
function optionalRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === undefined || value === null) return {};
  return asRecord(value, label);
}

function requireText(value: unknown, label: string, max: number): string {
  if (typeof value !== 'string') throw new Error(`${label}必须是文本`);
  if (value.length > max) throw new Error(`${label}不能超过 ${max} 个字符`);
  return value;
}

/** 允许显式传 null（表示“清空”）的文本字段 */
function nullableText(value: unknown, label: string, max: number): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return requireText(value, label, max);
}

function requireId(value: unknown, label: string): string {
  if (typeof value !== 'string' || !ID_PATTERN.test(value)) throw new Error(`${label}格式不正确`);
  return value;
}

/** 对外暴露的 id 校验：课程 / 练习 / 复习项等 */
export function requireEntityId(value: unknown, label: string): string {
  return requireId(value, label);
}

/** 关联 id：允许 null（表示不关联） */
function nullableId(value: unknown, label: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  return requireId(value, label);
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${label}必须是布尔值`);
  return value;
}

function requireInteger(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${label}必须是 ${min} 到 ${max} 之间的整数`);
  }
  return value;
}

function optionalLimit(value: unknown, label = '数量上限'): number | undefined {
  if (value === undefined || value === null) return undefined;
  return requireInteger(value, label, 1, MAX_LIMIT);
}

function requireLanguage(value: unknown): LanguageId {
  if (!isOneOf(value, LANGUAGE_IDS)) throw new Error('语言不在允许的范围内');
  return value;
}

function requireColorKey(value: unknown): CourseColorKey {
  if (!isOneOf(value, COURSE_COLOR_KEYS)) throw new Error('课程配色不在允许的范围内');
  return value;
}

function requireIconKey(value: unknown): string {
  if (!isOneOf(value, COURSE_ICON_KEYS)) throw new Error('课程图标不在允许的范围内');
  return value;
}

export function requireReviewAction(value: unknown): ReviewAction {
  if (!isOneOf(value, REVIEW_ACTIONS)) throw new Error('复习操作不在允许的范围内');
  return value;
}

function requireDifficulty(value: unknown): ExerciseDifficulty {
  if (!isOneOf(value, EXERCISE_DIFFICULTIES)) throw new Error('练习难度不在允许的范围内');
  return value;
}

function requireTags(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error('标签必须是数组');
  if (value.length > MAX_TAGS) throw new Error(`标签最多 ${MAX_TAGS} 个`);
  return value.map((tag) => {
    const name = requireText(tag, '标签', MAX_TAG).trim();
    if (name.length === 0) throw new Error('标签不能为空');
    return name;
  });
}

function requireDocJson(value: unknown): string {
  const text = requireText(value, '正文', MAX_BODY);
  try {
    JSON.parse(text);
  } catch {
    throw new Error('正文 JSON 格式不合法');
  }
  return text;
}

function nullableIso(value: unknown, label: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const text = requireText(value, label, 40);
  if (Number.isNaN(new Date(text).getTime())) throw new Error(`${label}不是合法的时间`);
  return text;
}

export function requireNoteId(value: unknown): string {
  return requireId(value, '笔记 ID');
}

/** 练习题勾选状态 */
export function validateExerciseToggle(value: unknown): boolean {
  return requireBoolean(value, '完成状态');
}

/* --------------------------------------------------------------- 各通道 */

export function validateCourseCreate(value: unknown): Partial<Course> & { name: string } {
  const record = asRecord(value, '课程参数');
  const course: Partial<Course> & { name: string } = {
    name: requireText(record.name, '课程名称', MAX_TITLE),
  };
  if (record.id !== undefined) course.id = requireId(record.id, '课程 ID');
  if (record.description !== undefined) {
    course.description = requireText(record.description, '课程说明', MAX_TITLE);
  }
  if (record.language !== undefined) course.language = requireLanguage(record.language);
  if (record.track !== undefined) {
    if (!isOneOf(record.track, COURSE_TRACK_IDS)) throw new Error('课程技术方向无效');
    course.track = record.track;
  }
  if (record.colorKey !== undefined) course.colorKey = requireColorKey(record.colorKey);
  if (record.iconKey !== undefined) course.iconKey = requireIconKey(record.iconKey);
  return course;
}

export function validateCourseUpdate(value: unknown): Partial<Course> {
  const record = asRecord(value, '课程参数');
  const patch: Partial<Course> = {};
  if (record.name !== undefined) patch.name = requireText(record.name, '课程名称', MAX_TITLE);
  if (record.description !== undefined) {
    patch.description = requireText(record.description, '课程说明', MAX_TITLE);
  }
  if (record.language !== undefined) patch.language = requireLanguage(record.language);
  if (record.track !== undefined) {
    if (!isOneOf(record.track, COURSE_TRACK_IDS)) throw new Error('课程技术方向无效');
    patch.track = record.track;
  }
  if (record.colorKey !== undefined) patch.colorKey = requireColorKey(record.colorKey);
  if (record.iconKey !== undefined) patch.iconKey = requireIconKey(record.iconKey);
  if (record.sortOrder !== undefined) {
    patch.sortOrder = requireInteger(record.sortOrder, '排序号', 0, 10_000);
  }
  return patch;
}

export function validateOrderedIds(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error('课程顺序必须是数组');
  if (value.length > MAX_LIMIT) throw new Error(`一次最多调整 ${MAX_LIMIT} 门课程的顺序`);
  return value.map((id) => requireId(id, '课程 ID'));
}

export function validateNoteListFilter(value: unknown): NoteListFilter {
  const record = optionalRecord(value, '筛选条件');
  const filter: NoteListFilter = {};
  if (record.courseId !== undefined) filter.courseId = requireId(record.courseId, '课程 ID');
  if (record.tag !== undefined) filter.tag = requireText(record.tag, '标签', MAX_TAG);
  if (record.favorite !== undefined) filter.favorite = requireBoolean(record.favorite, '收藏筛选');
  if (record.language !== undefined) filter.language = requireLanguage(record.language);
  if (record.archived !== undefined) filter.archived = requireBoolean(record.archived, '归档筛选');
  if (record.search !== undefined) filter.search = requireText(record.search, '搜索词', MAX_TITLE);
  if (record.limit !== undefined) filter.limit = optionalLimit(record.limit);
  return filter;
}

export function validateNoteCreate(value: unknown): NoteInput {
  const record = asRecord(value, '笔记参数');
  const input: NoteInput = {
    courseId: requireId(record.courseId, '课程 ID'),
    title: requireText(record.title, '标题', MAX_TITLE),
    language: requireLanguage(record.language),
  };
  if (record.tags !== undefined) input.tags = requireTags(record.tags);
  if (record.contentJson !== undefined) input.contentJson = requireDocJson(record.contentJson);
  return input;
}

export function validateNotePatch(value: unknown): NotePatch {
  const record = asRecord(value, '笔记修改');
  const patch: NotePatch = {};
  if (record.title !== undefined) patch.title = requireText(record.title, '标题', MAX_TITLE);
  if (record.courseId !== undefined) patch.courseId = requireId(record.courseId, '课程 ID');
  if (record.contentJson !== undefined) patch.contentJson = requireDocJson(record.contentJson);
  if (record.contentText !== undefined) {
    patch.contentText = requireText(record.contentText, '正文纯文本', MAX_BODY);
  }
  if (record.excerpt !== undefined) patch.excerpt = requireText(record.excerpt, '摘要', 500);
  if (record.language !== undefined) patch.language = requireLanguage(record.language);
  if (record.tags !== undefined) patch.tags = requireTags(record.tags);
  if (record.favorite !== undefined) patch.favorite = requireBoolean(record.favorite, '收藏状态');
  if (record.archived !== undefined) patch.archived = requireBoolean(record.archived, '归档状态');
  if (record.lastOpenedAt !== undefined) {
    patch.lastOpenedAt = nullableIso(record.lastOpenedAt, '打开时间');
  }
  return patch;
}

export function validateSearchQuery(value: unknown): SearchQuery {
  const record = asRecord(value, '搜索条件');
  const query: SearchQuery = { text: requireText(record.text, '关键词', MAX_TITLE) };
  if (record.courseId !== undefined) query.courseId = requireId(record.courseId, '课程 ID');
  if (record.language !== undefined) query.language = requireLanguage(record.language);
  if (record.favoriteOnly !== undefined) {
    query.favoriteOnly = requireBoolean(record.favoriteOnly, '只看收藏');
  }
  if (record.includeCode !== undefined) {
    query.includeCode = requireBoolean(record.includeCode, '搜索代码');
  }
  if (record.limit !== undefined) query.limit = optionalLimit(record.limit);
  return query;
}

export function validateSnippetCreate(value: unknown): CodeSnippetInput {
  const record = asRecord(value, '代码片段参数');
  const input: CodeSnippetInput = {
    title: requireText(record.title, '片段标题', MAX_TITLE),
    language: requireLanguage(record.language),
    code: requireText(record.code, '代码', MAX_CODE),
  };
  if (record.description !== undefined) {
    input.description = requireText(record.description, '片段说明', MAX_SHORT);
  }
  if (record.output !== undefined) input.output = nullableText(record.output, '运行结果', MAX_CODE);
  if (record.courseId !== undefined) input.courseId = nullableId(record.courseId, '课程 ID');
  if (record.noteId !== undefined) input.noteId = nullableId(record.noteId, '笔记 ID');
  return input;
}

export function validateSnippetLimit(value: unknown): number | undefined {
  return optionalLimit(value, '片段数量');
}

export function validateExerciseCreate(value: unknown): ExerciseInput {
  const record = asRecord(value, '练习参数');
  const input: ExerciseInput = {
    title: requireText(record.title, '练习标题', MAX_TITLE),
    prompt: requireText(record.prompt, '题目正文', MAX_BODY),
    language: requireLanguage(record.language),
  };
  if (record.difficulty !== undefined) input.difficulty = requireDifficulty(record.difficulty);
  if (record.hint !== undefined) input.hint = nullableText(record.hint, '思路提示', MAX_SHORT);
  if (record.solution !== undefined) input.solution = nullableText(record.solution, '参考答案', MAX_BODY);
  if (record.courseId !== undefined) input.courseId = nullableId(record.courseId, '课程 ID');
  if (record.noteId !== undefined) input.noteId = nullableId(record.noteId, '笔记 ID');
  return input;
}

export function validateExerciseFilter(value: unknown): {
  courseId?: string;
  noteId?: string;
  limit?: number;
} {
  const record = optionalRecord(value, '练习筛选条件');
  const filter: { courseId?: string; noteId?: string; limit?: number } = {};
  if (record.courseId !== undefined) filter.courseId = requireId(record.courseId, '课程 ID');
  if (record.noteId !== undefined) filter.noteId = requireId(record.noteId, '笔记 ID');
  if (record.limit !== undefined) filter.limit = optionalLimit(record.limit);
  return filter;
}

export function validateReviewFilter(value: unknown): { state?: string } {
  const record = optionalRecord(value, '复习筛选条件');
  const state = record.state;
  // 没传或传 'all' 都表示不过滤
  if (state === undefined || state === null || state === 'all') return {};
  if (!isOneOf(state, REVIEW_STATES)) throw new Error('复习状态不在允许的范围内');
  return { state };
}

export function validateSettingsPatch(value: unknown): Partial<UserSettings> {
  const record = asRecord(value, '设置参数');
  const patch: Partial<UserSettings> = {};
  if (record.theme !== undefined) {
    if (!isOneOf(record.theme, THEME_MODES)) throw new Error('主题只能是 light 或 dark');
    patch.theme = record.theme;
  }
  if (record.editorFontSize !== undefined) {
    patch.editorFontSize = requireInteger(record.editorFontSize, '编辑器字号', 12, 24);
  }
  if (record.editorFontFamily !== undefined) {
    if (!isOneOf(record.editorFontFamily, EDITOR_FONT_FAMILIES)) {
      throw new Error('编辑器字体只能是 sans 或 mono');
    }
    patch.editorFontFamily = record.editorFontFamily;
  }
  if (record.autoSaveDelayMs !== undefined) {
    patch.autoSaveDelayMs = requireInteger(record.autoSaveDelayMs, '自动保存延迟', 200, 5000);
  }
  if (record.sidebarCollapsed !== undefined) {
    patch.sidebarCollapsed = requireBoolean(record.sidebarCollapsed, '侧栏折叠状态');
  }
  if (record.asideCollapsed !== undefined) {
    patch.asideCollapsed = requireBoolean(record.asideCollapsed, '辅助栏折叠状态');
  }
  if (record.lastOpenedNoteId !== undefined) {
    patch.lastOpenedNoteId = nullableId(record.lastOpenedNoteId, '笔记 ID') ?? null;
  }
  if (record.recentNoteIds !== undefined) {
    if (!Array.isArray(record.recentNoteIds)) throw new Error('最近打开的笔记必须是数组');
    if (record.recentNoteIds.length > MAX_RECENT_NOTES) {
      throw new Error(`最近打开的笔记最多 ${MAX_RECENT_NOTES} 条`);
    }
    patch.recentNoteIds = record.recentNoteIds.map((id) => requireId(id, '笔记 ID'));
  }
  return patch;
}

/** 导出参数：只接受文件名建议，不接受路径 */
export function validateExportArgs(args: unknown[]): { suggestedName: string; content: string } {
  const suggestedName = requireText(args[0], '文件名', MAX_SNIPPET_NAME);
  if (suggestedName.includes('..') || /[\\/]/.test(suggestedName)) {
    throw new Error('文件名不能包含路径分隔符或「..」');
  }
  return { suggestedName, content: requireText(args[1], '导出内容', MAX_BODY) };
}

export function validateExternalUrl(value: unknown): string {
  const text = requireText(value, '链接', MAX_SHORT);
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    throw new Error('链接格式不正确');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('只能打开 http 或 https 链接');
  }
  return parsed.toString();
}
