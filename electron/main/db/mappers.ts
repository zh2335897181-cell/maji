/* =============================================================================
   码迹 · SQLite 行 <-> 领域对象映射
   -----------------------------------------------------------------------------
   · 列名 snake_case，领域对象 camelCase，转换只发生在本文件
   · 枚举白名单也定义在这里：写入前校验（ipc/validate.ts）与读回时兜底共用一份，
     保证“能写进去的值”和“读得出来的值”永远一致
   · 课程图标白名单取自 src/lib/icons.ts 的 COURSE_ICONS；
     那个文件依赖 React，主进程不能直接 import，所以在这里重新登记一份
   ============================================================================= */

import type {
  CodeSnippet,
  Course,
  CourseColorKey,
  CourseTrackId,
  Exercise,
  ExerciseDifficulty,
  LanguageId,
  Note,
  NoteSummary,
  ReviewItem,
  ReviewItemWithNote,
  ActiveTimeSegment,
  ReviewGrade,
  ReviewQuestion,
  ReviewSession,
  ReviewSessionWithQuestions,
  ReviewState,
  UserSettings,
} from '../../../src/lib/types';
import { DEFAULT_SETTINGS } from '../../../src/lib/types';
import { isCourseTrackId, trackFromLanguage } from '../../../src/lib/courseTracks';
import { extractCodeText, type Doc } from '../../../src/lib/noteDoc';
import type { SearchDocument } from '../../../src/lib/search';
import type { SqliteDatabase } from './connection';

/* ------------------------------------------------------------ 枚举白名单 */

export const LANGUAGE_IDS = [
  'python',
  'javascript',
  'typescript',
  'html',
  'css',
  'java',
  'c',
  'text',
] as const;
export const COURSE_COLOR_KEYS = [
  'teal',
  'blue',
  'violet',
  'amber',
  'green',
  'rose',
  'slate',
] as const;
export const COURSE_TRACK_IDS = [
  'python', 'javascript', 'typescript', 'html', 'css', 'java', 'c', 'text',
  'vue', 'react', 'nodejs', 'springboot', 'django', 'flask', 'algorithms', 'database', 'other',
] as const satisfies readonly CourseTrackId[];
export const COURSE_ICON_KEYS = [
  'book',
  'braces',
  'layout',
  'coffee',
  'binary',
  'terminal',
  'database',
  'globe',
  'palette',
  'cpu',
  'hash',
  'target',
] as const;
export const REVIEW_STATES = ['due', 'scheduled', 'mastered', 'archived'] as const;
export const REVIEW_ACTIONS = ['review-again', 'mastered', 'remind-later'] as const;
export const REVIEW_DEPTHS = ['quick', 'standard', 'deep'] as const;
export const REVIEW_QUESTION_TYPES = ['concept', 'short-answer', 'code-reading', 'code-writing', 'code-fix'] as const;
export const EXERCISE_DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export const CONFIDENCE_LEVELS = ['low', 'medium', 'high'] as const;
export const THEME_MODES = ['light', 'dark'] as const;
export const EDITOR_FONT_FAMILIES = ['sans', 'mono'] as const;

export function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value);
}

/* -------------------------------------------------------------- 查询助手 */

export function selectRows<T>(db: SqliteDatabase, sql: string, params: unknown[] = []): T[] {
  return db.prepare<unknown[], T>(sql).all(...params);
}

export function selectOne<T>(
  db: SqliteDatabase,
  sql: string,
  params: unknown[] = [],
): T | undefined {
  return db.prepare<unknown[], T>(sql).get(...params);
}

/* ---------------------------------------------------------------- 行结构 */

export interface CountRow {
  count: number;
}
export interface SettingRow {
  key: string;
  value: string;
}
export interface CourseRow {
  id: string;
  name: string;
  description: string;
  language: string;
  track: string;
  color_key: string;
  icon_key: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}
export interface NoteRow {
  id: string;
  course_id: string;
  title: string;
  content_json: string;
  content_text: string;
  code_text: string;
  excerpt: string;
  language: string;
  tags: string;
  favorite: number;
  archived: number;
  created_at: string;
  updated_at: string;
  last_opened_at: string | null;
  /** LEFT JOIN courses 得到的展示字段，未分类时为空 */
  course_name?: string | null;
  course_color_key?: string | null;
}
export interface SnippetRow {
  id: string;
  title: string;
  language: string;
  code: string;
  description: string;
  output: string | null;
  course_id: string | null;
  note_id: string | null;
  created_at: string;
  updated_at: string;
}
export interface ExerciseRow {
  id: string;
  title: string;
  prompt: string;
  hint: string | null;
  solution: string | null;
  language: string;
  difficulty: string;
  done: number;
  course_id: string | null;
  note_id: string | null;
  created_at: string;
  updated_at: string;
}
export interface ReviewRow {
  id: string;
  title: string;
  summary: string;
  note_id: string;
  course_id: string;
  state: string;
  due_at: string | null;
  last_reviewed_at: string | null;
  review_count: number;
  mastered_streak: number;
  confidence: string | null;
  created_at: string;
  updated_at: string;
  note_title?: string | null;
  course_name?: string | null;
  course_color_key?: string | null;
}
export interface ReviewSessionRow {
  id: string;
  scope: string;
  status: string;
  depth: string;
  planned_question_count: number;
  sources: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number;
  active_segments: string;
  active_segment_started_at: string | null;
  created_at: string;
  updated_at: string;
}
export interface ReviewQuestionRow {
  id: string;
  session_id: string;
  question_order: number;
  type: string;
  difficulty: string;
  title: string;
  prompt: string;
  hint: string;
  reference_answer: string;
  explanation: string;
  language: string;
  source_note_id: string | null;
  answer: string | null;
  grade: string | null;
  answered_at: string | null;
  graded_at: string | null;
}

/* ------------------------------------------------------------ 读回兜底 */

export function asLanguage(value: unknown): LanguageId {
  return isOneOf(value, LANGUAGE_IDS) ? value : 'text';
}
export function asColorKey(value: unknown): CourseColorKey {
  return isOneOf(value, COURSE_COLOR_KEYS) ? value : 'slate';
}
export function asReviewState(value: unknown): ReviewState {
  return isOneOf(value, REVIEW_STATES) ? value : 'due';
}
export function asDifficulty(value: unknown): ExerciseDifficulty {
  return isOneOf(value, EXERCISE_DIFFICULTIES) ? value : 'easy';
}
export function asConfidence(value: unknown): ReviewItem['confidence'] {
  return isOneOf(value, CONFIDENCE_LEVELS) ? value : null;
}
/** tags 列是不合法的 JSON 时按空数组处理，绝不让读取整库失败 */
export function parseTags(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((tag): tag is string => typeof tag === 'string') : [];
  } catch {
    return [];
  }
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string') return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/** 从 TipTap 文档 JSON 派生 code_text 列（搜索粗筛用）；文档损坏时按空串处理 */
export function deriveCodeText(contentJson: string): string {
  try {
    return extractCodeText(JSON.parse(contentJson) as Doc);
  } catch {
    return '';
  }
}

/* ------------------------------------------------------ 行 -> 领域对象 */

export function toCourse(row: CourseRow): Course {
  const language = asLanguage(row.language);
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    language,
    track: isCourseTrackId(row.track) ? row.track : trackFromLanguage(language),
    colorKey: asColorKey(row.color_key),
    iconKey: row.icon_key,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toNote(row: NoteRow): Note {
  return {
    id: row.id,
    courseId: row.course_id,
    title: row.title,
    contentJson: row.content_json,
    contentText: row.content_text,
    excerpt: row.excerpt,
    language: asLanguage(row.language),
    tags: parseTags(row.tags),
    favorite: row.favorite !== 0,
    archived: row.archived !== 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastOpenedAt: row.last_opened_at,
  };
}

export function toNoteSummary(row: NoteRow): NoteSummary {
  const note = toNote(row);
  return {
    id: note.id,
    courseId: note.courseId,
    title: note.title,
    excerpt: note.excerpt,
    language: note.language,
    tags: note.tags,
    favorite: note.favorite,
    archived: note.archived,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    lastOpenedAt: note.lastOpenedAt,
    courseName: row.course_name ?? '未分类',
    courseColorKey: asColorKey(row.course_color_key),
  };
}

export function toSnippet(row: SnippetRow): CodeSnippet {
  return {
    id: row.id,
    title: row.title,
    language: asLanguage(row.language),
    code: row.code,
    description: row.description,
    output: row.output,
    courseId: row.course_id,
    noteId: row.note_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toExercise(row: ExerciseRow): Exercise {
  return {
    id: row.id,
    title: row.title,
    prompt: row.prompt,
    hint: row.hint,
    solution: row.solution,
    language: asLanguage(row.language),
    difficulty: asDifficulty(row.difficulty),
    done: row.done !== 0,
    courseId: row.course_id,
    noteId: row.note_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toReviewItem(row: ReviewRow): ReviewItem {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    noteId: row.note_id,
    courseId: row.course_id,
    state: asReviewState(row.state),
    dueAt: row.due_at,
    lastReviewedAt: row.last_reviewed_at,
    reviewCount: row.review_count,
    masteredStreak: row.mastered_streak,
    confidence: asConfidence(row.confidence),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toReviewItemWithNote(row: ReviewRow): ReviewItemWithNote {
  return {
    ...toReviewItem(row),
    noteTitle: row.note_title ?? '笔记已删除',
    courseName: row.course_name ?? '未分类',
    courseColorKey: asColorKey(row.course_color_key),
  };
}

export function toReviewQuestion(row: ReviewQuestionRow): ReviewQuestion {
  const parsedGrade = parseJson<unknown>(row.grade, null);
  const grade = typeof parsedGrade === 'object' && parsedGrade !== null && !Array.isArray(parsedGrade)
    ? parsedGrade as ReviewGrade
    : null;
  return {
    id: row.id,
    sessionId: row.session_id,
    order: row.question_order,
    type: isOneOf(row.type, REVIEW_QUESTION_TYPES) ? row.type : 'concept',
    difficulty: asDifficulty(row.difficulty),
    title: row.title,
    prompt: row.prompt,
    hint: row.hint,
    referenceAnswer: row.reference_answer,
    explanation: row.explanation,
    language: asLanguage(row.language),
    sourceNoteId: row.source_note_id,
    answer: row.answer,
    grade,
    answeredAt: row.answered_at,
    gradedAt: row.graded_at,
  };
}

export function toReviewSession(
  row: ReviewSessionRow,
  questionRows: ReviewQuestionRow[],
): ReviewSessionWithQuestions {
  const questions = questionRows.map(toReviewQuestion);
  const scores = questions.flatMap((question) => question.grade ? [question.grade.score] : []);
  return {
    id: row.id,
    scope: isOneOf(row.scope, ['due', 'course', 'notes'] as const) ? row.scope : 'notes',
    status: isOneOf(row.status, ['in-progress', 'completed'] as const) ? row.status : 'in-progress',
    depth: isOneOf(row.depth, REVIEW_DEPTHS) ? row.depth : 'standard',
    plannedQuestionCount: row.planned_question_count,
    sources: parseJson(row.sources, []),
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationSeconds: Math.max(0, row.duration_seconds),
    activeSegments: parseJson<ActiveTimeSegment[]>(row.active_segments, []),
    activeSegmentStartedAt: row.active_segment_started_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    questionCount: questions.length,
    averageScore: scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null,
    questions,
  };
}

export function reviewSessionParams(session: ReviewSession) {
  return {
    id: session.id,
    scope: session.scope,
    status: session.status,
    depth: session.depth,
    planned_question_count: session.plannedQuestionCount,
    sources: JSON.stringify(session.sources),
    started_at: session.startedAt,
    ended_at: session.endedAt,
    duration_seconds: session.durationSeconds,
    active_segments: JSON.stringify(session.activeSegments),
    active_segment_started_at: session.activeSegmentStartedAt,
    created_at: session.createdAt,
    updated_at: session.updatedAt,
  };
}

export function reviewQuestionParams(question: ReviewQuestion) {
  return {
    id: question.id,
    session_id: question.sessionId,
    question_order: question.order,
    type: question.type,
    difficulty: question.difficulty,
    title: question.title,
    prompt: question.prompt,
    hint: question.hint,
    reference_answer: question.referenceAnswer,
    explanation: question.explanation,
    language: question.language,
    source_note_id: question.sourceNoteId,
    answer: question.answer,
    grade: question.grade ? JSON.stringify(question.grade) : null,
    answered_at: question.answeredAt,
    graded_at: question.gradedAt,
  };
}

/** 搜索用文档：正文与代码分开，代码来自 code_text 派生列 */
export function toSearchDocument(row: NoteRow): SearchDocument {
  return {
    id: row.id,
    title: row.title,
    courseId: row.course_id,
    courseName: row.course_name ?? '未分类',
    courseColorKey: asColorKey(row.course_color_key),
    language: asLanguage(row.language),
    updatedAt: row.updated_at,
    favorite: row.favorite !== 0,
    tags: parseTags(row.tags),
    contentText: row.content_text,
    codeText: row.code_text,
  };
}

/* ------------------------------------------------------ 领域对象 -> 参数 */

export function courseParams(course: Course) {
  return {
    id: course.id,
    name: course.name,
    description: course.description,
    language: course.language,
    track: course.track,
    color_key: course.colorKey,
    icon_key: course.iconKey,
    sort_order: course.sortOrder,
    created_at: course.createdAt,
    updated_at: course.updatedAt,
  };
}

/** codeText 由 contentJson 派生（extractCodeText），调用方负责算好传进来 */
export function noteParams(note: Note, codeText: string) {
  return {
    id: note.id,
    course_id: note.courseId,
    title: note.title,
    content_json: note.contentJson,
    content_text: note.contentText,
    code_text: codeText,
    excerpt: note.excerpt,
    language: note.language,
    tags: JSON.stringify(note.tags),
    favorite: note.favorite ? 1 : 0,
    archived: note.archived ? 1 : 0,
    created_at: note.createdAt,
    updated_at: note.updatedAt,
    last_opened_at: note.lastOpenedAt,
  };
}

export function snippetParams(snippet: CodeSnippet) {
  return {
    id: snippet.id,
    title: snippet.title,
    language: snippet.language,
    code: snippet.code,
    description: snippet.description,
    output: snippet.output,
    course_id: snippet.courseId,
    note_id: snippet.noteId,
    created_at: snippet.createdAt,
    updated_at: snippet.updatedAt,
  };
}

export function exerciseParams(exercise: Exercise) {
  return {
    id: exercise.id,
    title: exercise.title,
    prompt: exercise.prompt,
    hint: exercise.hint,
    solution: exercise.solution,
    language: exercise.language,
    difficulty: exercise.difficulty,
    done: exercise.done ? 1 : 0,
    course_id: exercise.courseId,
    note_id: exercise.noteId,
    created_at: exercise.createdAt,
    updated_at: exercise.updatedAt,
  };
}

export function reviewParams(item: ReviewItem) {
  return {
    id: item.id,
    title: item.title,
    summary: item.summary,
    note_id: item.noteId,
    course_id: item.courseId,
    state: item.state,
    due_at: item.dueAt,
    last_reviewed_at: item.lastReviewedAt,
    review_count: item.reviewCount,
    mastered_streak: item.masteredStreak,
    confidence: item.confidence,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
  };
}

/* --------------------------------------------------------------- 设置 */

/** settings 表按 key/value 存 JSON；缺失或损坏的单项回落到 DEFAULT_SETTINGS */
export function toSettings(rows: SettingRow[]): UserSettings {
  const raw = new Map<string, unknown>();
  for (const row of rows) {
    try {
      raw.set(row.key, JSON.parse(row.value));
    } catch {
      // 单项损坏只影响这一项
    }
  }

  const settings: UserSettings = { ...DEFAULT_SETTINGS };
  const theme = raw.get('theme');
  if (isOneOf(theme, THEME_MODES)) settings.theme = theme;
  const fontFamily = raw.get('editorFontFamily');
  if (isOneOf(fontFamily, EDITOR_FONT_FAMILIES)) settings.editorFontFamily = fontFamily;
  const fontSize = raw.get('editorFontSize');
  if (typeof fontSize === 'number' && fontSize >= 12 && fontSize <= 24) {
    settings.editorFontSize = Math.round(fontSize);
  }
  const autoSave = raw.get('autoSaveDelayMs');
  if (typeof autoSave === 'number' && autoSave >= 200 && autoSave <= 5000) {
    settings.autoSaveDelayMs = Math.round(autoSave);
  }
  if (typeof raw.get('sidebarCollapsed') === 'boolean') {
    settings.sidebarCollapsed = raw.get('sidebarCollapsed') === true;
  }
  if (typeof raw.get('asideCollapsed') === 'boolean') {
    settings.asideCollapsed = raw.get('asideCollapsed') === true;
  }
  const lastOpened = raw.get('lastOpenedNoteId');
  settings.lastOpenedNoteId = typeof lastOpened === 'string' ? lastOpened : null;
  const recent = raw.get('recentNoteIds');
  if (Array.isArray(recent)) {
    settings.recentNoteIds = recent
      .filter((id): id is string => typeof id === 'string')
      .slice(0, 6);
  }
  return settings;
}

export function settingsParams(settings: UserSettings): SettingRow[] {
  return Object.entries(settings).map(([key, value]) => ({ key, value: JSON.stringify(value) }));
}
