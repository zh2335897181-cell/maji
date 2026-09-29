/* =============================================================================
   码迹 · 代码片段 / 练习题 / 复习 / 标签 / 设置
   -----------------------------------------------------------------------------
   行为对齐 src/lib/localRepository.ts：
   · 复习动作调用共享的 applyReviewAction（src/lib/review.ts）算状态转移
   · 标签统计按“笔记数降序，再按中文拼音升序”，与浏览器实现同一套比较器
   · 设置以 key/value 存 JSON，读取时与 DEFAULT_SETTINGS 合并
   ============================================================================= */

import type {
  CodeSnippet,
  CodeSnippetInput,
  Exercise,
  ExerciseInput,
  ReviewAction,
  ReviewItem,
  ReviewItemWithNote,
  ActiveTimeSegment,
  GeneratedReviewQuestion,
  ReviewQuestion,
  ReviewQuestionAnswerInput,
  ReviewQuestionGradeInput,
  ReviewSession,
  ReviewSessionFilter,
  ReviewSessionInput,
  ReviewSessionPatch,
  ReviewSessionSummary,
  ReviewSessionWithQuestions,
  Tag,
  UserSettings,
} from '../../../src/lib/types';
import { createId } from '../../../src/lib/text';
import { applyReviewAction as computeReviewTransition } from '../../../src/lib/review';
import { getDb } from './connection';
import type { SqliteDatabase } from './connection';
import {
  exerciseParams,
  reviewParams,
  reviewQuestionParams,
  reviewSessionParams,
  selectOne,
  selectRows,
  settingsParams,
  snippetParams,
  toExercise,
  toReviewItem,
  toReviewItemWithNote,
  toReviewQuestion,
  toReviewSession,
  toSettings,
  toSnippet,
  type ExerciseRow,
  type ReviewRow,
  type ReviewQuestionRow,
  type ReviewSessionRow,
  type SettingRow,
  type SnippetRow,
} from './mappers';

const SELECT_SNIPPETS = 'SELECT * FROM snippets ORDER BY updated_at DESC, rowid ASC';
const REVIEW_SELECT = `
SELECT r.*, n.title AS note_title, c.name AS course_name, c.color_key AS course_color_key
FROM review_items r
LEFT JOIN notes n ON n.id = r.note_id
LEFT JOIN courses c ON c.id = r.course_id`;

/* --------------------------------------------------------- 代码片段 */

export function listSnippets(limit?: number): CodeSnippet[] {
  const rows = selectRows<SnippetRow>(getDb(), SELECT_SNIPPETS);
  return (typeof limit === 'number' ? rows.slice(0, limit) : rows).map(toSnippet);
}

export function createSnippet(input: CodeSnippetInput): CodeSnippet {
  const now = new Date().toISOString();
  const snippet: CodeSnippet = {
    id: createId('snippet'),
    title: input.title.trim() || '未命名代码片段',
    language: input.language,
    code: input.code,
    description: input.description?.trim() ?? '',
    output: input.output ?? null,
    courseId: input.courseId ?? null,
    noteId: input.noteId ?? null,
    createdAt: now,
    updatedAt: now,
  };
  getDb()
    .prepare(
      `INSERT INTO snippets (id, title, language, code, description, output, course_id, note_id, created_at, updated_at)
       VALUES (@id, @title, @language, @code, @description, @output, @course_id, @note_id, @created_at, @updated_at)`,
    )
    .run(snippetParams(snippet));
  return snippet;
}

/* ----------------------------------------------------------- 练习题 */

export function listExercises(
  filter: { courseId?: string; noteId?: string; limit?: number } = {},
): Exercise[] {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (filter.courseId) {
    conditions.push('course_id = ?');
    params.push(filter.courseId);
  }
  if (filter.noteId) {
    conditions.push('note_id = ?');
    params.push(filter.noteId);
  }

  const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
  const rows = selectRows<ExerciseRow>(
    getDb(),
    `SELECT * FROM exercises${where} ORDER BY done ASC, rowid ASC`,
    params,
  );
  // 未完成的排在前面；limit 为 0 / undefined 时不截断（与浏览器实现一致）
  return (filter.limit ? rows.slice(0, filter.limit) : rows).map(toExercise);
}

export function createExercise(input: ExerciseInput): Exercise {
  const now = new Date().toISOString();
  const exercise: Exercise = {
    id: createId('exercise'),
    title: input.title.trim() || '未命名练习',
    prompt: input.prompt.trim(),
    hint: input.hint?.trim() ?? null,
    solution: input.solution?.trim() ?? null,
    language: input.language,
    difficulty: input.difficulty ?? 'easy',
    done: false,
    courseId: input.courseId ?? null,
    noteId: input.noteId ?? null,
    createdAt: now,
    updatedAt: now,
  };
  getDb()
    .prepare(
      `INSERT INTO exercises (id, title, prompt, hint, solution, language, difficulty, done, course_id, note_id, created_at, updated_at)
       VALUES (@id, @title, @prompt, @hint, @solution, @language, @difficulty, @done, @course_id, @note_id, @created_at, @updated_at)`,
    )
    .run(exerciseParams(exercise));
  return exercise;
}

export function toggleExercise(id: string, done: boolean): Exercise {
  const db = getDb();
  if (!selectOne<ExerciseRow>(db, 'SELECT * FROM exercises WHERE id = ?', [id])) {
    throw new Error(`练习不存在：${id}`);
  }
  db.prepare('UPDATE exercises SET done = ?, updated_at = ? WHERE id = ?').run(
    done ? 1 : 0,
    new Date().toISOString(),
    id,
  );
  const updated = selectOne<ExerciseRow>(db, 'SELECT * FROM exercises WHERE id = ?', [id]);
  if (!updated) throw new Error(`练习不存在：${id}`);
  return toExercise(updated);
}

/* ------------------------------------------------------------- 复习 */

export function listReviewItems(filter: { state?: string } = {}): ReviewItemWithNote[] {
  const where = filter.state ? ' WHERE r.state = ?' : '';
  const params = filter.state ? [filter.state] : [];
  const rows = selectRows<ReviewRow>(getDb(), `${REVIEW_SELECT}${where} ORDER BY r.rowid ASC`, params);
  return rows.map(toReviewItemWithNote);
}

export function applyReviewAction(id: string, action: ReviewAction): ReviewItem {
  const db = getDb();
  const row = selectOne<ReviewRow>(db, 'SELECT * FROM review_items WHERE id = ?', [id]);
  if (!row) throw new Error(`复习知识点不存在：${id}`);

  const transition = computeReviewTransition(toReviewItem(row), action);
  db.prepare(
    `UPDATE review_items
     SET state = ?, due_at = ?, review_count = ?, mastered_streak = ?, confidence = ?, last_reviewed_at = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    transition.state,
    transition.dueAt,
    transition.reviewCount,
    transition.masteredStreak,
    transition.confidence,
    transition.lastReviewedAt,
    new Date().toISOString(),
    id,
  );

  const updated = selectOne<ReviewRow>(db, 'SELECT * FROM review_items WHERE id = ?', [id]);
  if (!updated) throw new Error(`复习知识点不存在：${id}`);
  return toReviewItem(updated);
}

/** 供冒烟测试/维护脚本把复习项写回指定状态 */
export function restoreReviewItem(item: ReviewItem): void {
  getDb()
    .prepare(
      `UPDATE review_items
       SET state = @state, due_at = @due_at, review_count = @review_count, mastered_streak = @mastered_streak, confidence = @confidence,
           last_reviewed_at = @last_reviewed_at, updated_at = @updated_at
       WHERE id = @id`,
    )
    .run(reviewParams(item));
}

/* -------------------------------------------------------- AI 复习会话 */

function readReviewSession(id: string): ReviewSessionWithQuestions | null {
  const db = getDb();
  const row = selectOne<ReviewSessionRow>(db, 'SELECT * FROM review_sessions WHERE id = ?', [id]);
  if (!row) return null;
  const questions = selectRows<ReviewQuestionRow>(
    db,
    'SELECT * FROM review_questions WHERE session_id = ? ORDER BY question_order ASC',
    [id],
  );
  return toReviewSession(row, questions);
}

function localDay(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function activeDurationSeconds(segments: ActiveTimeSegment[], activeStart: string | null, now = new Date()): number {
  const milliseconds = segments.reduce((sum, segment) => {
    const start = Date.parse(segment.startedAt);
    const end = Date.parse(segment.endedAt);
    return Number.isFinite(start) && Number.isFinite(end) && end > start ? sum + end - start : sum;
  }, 0);
  const openStart = activeStart ? Date.parse(activeStart) : NaN;
  return Math.max(0, Math.floor((milliseconds + (Number.isFinite(openStart) ? Math.max(0, now.getTime() - openStart) : 0)) / 1000));
}

export function listReviewSessions(filter: ReviewSessionFilter = {}): ReviewSessionSummary[] {
  const rows = selectRows<ReviewSessionRow>(getDb(), 'SELECT * FROM review_sessions ORDER BY started_at DESC');
  return rows
    .filter((row) => !filter.status || row.status === filter.status)
    .filter((row) => {
      const day = localDay(row.started_at);
      return (!filter.fromDate || day >= filter.fromDate) && (!filter.toDate || day <= filter.toDate);
    })
    .flatMap((row) => {
      const session = readReviewSession(row.id);
      if (!session) return [];
      const { questions: _questions, ...summary } = session;
      return [summary];
    });
}

export function getReviewSession(id: string): ReviewSessionWithQuestions | null {
  return readReviewSession(id);
}

export function createReviewSession(input: ReviewSessionInput): ReviewSessionWithQuestions {
  const db = getDb();
  const now = new Date().toISOString();
  const id = createId('review_session');
  const session: ReviewSession = {
    id,
    scope: input.scope,
    status: 'in-progress',
    depth: input.depth,
    plannedQuestionCount: input.plannedQuestionCount,
    sources: input.sources,
    startedAt: now,
    endedAt: null,
    durationSeconds: 0,
    activeSegments: [],
    activeSegmentStartedAt: now,
    createdAt: now,
    updatedAt: now,
  };
  const questions: ReviewQuestion[] = input.questions.map((question: GeneratedReviewQuestion, index) => ({
    ...question,
    id: createId('review_question'),
    sessionId: id,
    order: index + 1,
    answer: null,
    grade: null,
    answeredAt: null,
    gradedAt: null,
  }));
  const insert = db.transaction(() => {
    db.prepare(
      `INSERT INTO review_sessions
       (id, scope, status, depth, planned_question_count, sources, started_at, ended_at, duration_seconds, active_segments, active_segment_started_at, created_at, updated_at)
       VALUES (@id, @scope, @status, @depth, @planned_question_count, @sources, @started_at, @ended_at, @duration_seconds, @active_segments, @active_segment_started_at, @created_at, @updated_at)`,
    ).run(reviewSessionParams(session));
    const insertQuestion = db.prepare(
      `INSERT INTO review_questions
       (id, session_id, question_order, type, difficulty, title, prompt, hint, reference_answer, explanation, language, source_note_id, answer, grade, answered_at, graded_at)
       VALUES (@id, @session_id, @question_order, @type, @difficulty, @title, @prompt, @hint, @reference_answer, @explanation, @language, @source_note_id, @answer, @grade, @answered_at, @graded_at)`,
    );
    for (const question of questions) insertQuestion.run(reviewQuestionParams(question));
  });
  insert();
  const created = readReviewSession(id);
  if (!created) throw new Error('创建复习会话失败');
  return created;
}

export function updateReviewSession(id: string, patch: ReviewSessionPatch): ReviewSessionWithQuestions {
  const db = getDb();
  const current = readReviewSession(id);
  if (!current) throw new Error(`复习会话不存在：${id}`);
  const now = new Date().toISOString();
  const next: ReviewSession = { ...current, ...patch, updatedAt: now };
  if (patch.status === 'completed') {
    next.endedAt ??= patch.endedAt ?? now;
    if (current.activeSegmentStartedAt && patch.activeSegmentStartedAt === undefined) {
      next.activeSegments = [...next.activeSegments, { startedAt: current.activeSegmentStartedAt, endedAt: next.endedAt }];
      next.activeSegmentStartedAt = null;
    }
  }
  if (patch.status === 'in-progress') next.endedAt = null;
  next.durationSeconds = activeDurationSeconds(next.activeSegments, next.activeSegmentStartedAt);
  db.prepare(
    `UPDATE review_sessions SET status = @status, ended_at = @ended_at, duration_seconds = @duration_seconds,
       active_segments = @active_segments, active_segment_started_at = @active_segment_started_at, updated_at = @updated_at
     WHERE id = @id`,
  ).run(reviewSessionParams(next));
  const updated = readReviewSession(id);
  if (!updated) throw new Error(`复习会话不存在：${id}`);
  return updated;
}

export function saveReviewQuestionAnswer(sessionId: string, input: ReviewQuestionAnswerInput): ReviewQuestion {
  const db = getDb();
  const now = new Date().toISOString();
  const save = db.transaction(() => {
    const result = db.prepare(
      `UPDATE review_questions SET answer = ?, grade = NULL, answered_at = ?, graded_at = NULL
       WHERE id = ? AND session_id = ?`,
    ).run(input.answer, now, input.questionId, sessionId);
    if (result.changes === 0) throw new Error(`练习题不存在：${input.questionId}`);
    db.prepare('UPDATE review_sessions SET updated_at = ? WHERE id = ?').run(now, sessionId);
  });
  save();
  const row = selectOne<ReviewQuestionRow>(db, 'SELECT * FROM review_questions WHERE id = ? AND session_id = ?', [input.questionId, sessionId]);
  if (!row) throw new Error(`练习题不存在：${input.questionId}`);
  return toReviewQuestion(row);
}

export function saveReviewQuestionGrade(sessionId: string, input: ReviewQuestionGradeInput): ReviewQuestion {
  const db = getDb();
  const question = selectOne<ReviewQuestionRow>(db, 'SELECT * FROM review_questions WHERE id = ? AND session_id = ?', [input.questionId, sessionId]);
  if (!question) throw new Error(`练习题不存在：${input.questionId}`);
  if (question.answer === null) throw new Error('请先保存答案再提交评阅');
  const now = new Date().toISOString();
  const save = db.transaction(() => {
    db.prepare('UPDATE review_questions SET grade = ?, graded_at = ? WHERE id = ? AND session_id = ?')
      .run(JSON.stringify(input.grade), now, input.questionId, sessionId);
    db.prepare('UPDATE review_sessions SET updated_at = ? WHERE id = ?').run(now, sessionId);
  });
  save();
  const row = selectOne<ReviewQuestionRow>(db, 'SELECT * FROM review_questions WHERE id = ? AND session_id = ?', [input.questionId, sessionId]);
  if (!row) throw new Error(`练习题不存在：${input.questionId}`);
  return toReviewQuestion(row);
}

/* ------------------------------------------------------------- 标签 */

export function listTags(): Tag[] {
  const rows = selectRows<{ name: string; note_count: number }>(
    getDb(),
    `SELECT json_each.value AS name, COUNT(*) AS note_count
     FROM notes, json_each(notes.tags)
     WHERE typeof(json_each.value) = 'text'
     GROUP BY json_each.value`,
  );
  return rows
    .map((row) => ({ name: row.name, noteCount: row.note_count }))
    .sort((a, b) => b.noteCount - a.noteCount || a.name.localeCompare(b.name, 'zh-Hans-CN'));
}

/* ------------------------------------------------------------- 设置 */

/** 读取设置（与 DEFAULT_SETTINGS 合并）；notes.ts 也会用到 */
export function loadSettings(db: SqliteDatabase): UserSettings {
  return toSettings(selectRows<SettingRow>(db, 'SELECT key, value FROM settings'));
}

/** 整表覆盖写入设置，调用方负责给出完整对象 */
export function saveSettings(db: SqliteDatabase, settings: UserSettings): void {
  const write = db.transaction(() => {
    const statement = db.prepare(
      `INSERT INTO settings (key, value) VALUES (@key, @value)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    );
    for (const entry of settingsParams(settings)) statement.run(entry);
  });
  write();
}

export function getSettings(): UserSettings {
  return loadSettings(getDb());
}

export function updateSettings(patch: Partial<UserSettings>): UserSettings {
  const db = getDb();
  const current = loadSettings(db);
  const next: UserSettings = {
    theme: patch.theme ?? current.theme,
    editorFontSize: patch.editorFontSize ?? current.editorFontSize,
    editorFontFamily: patch.editorFontFamily ?? current.editorFontFamily,
    autoSaveDelayMs: patch.autoSaveDelayMs ?? current.autoSaveDelayMs,
    sidebarCollapsed: patch.sidebarCollapsed ?? current.sidebarCollapsed,
    asideCollapsed: patch.asideCollapsed ?? current.asideCollapsed,
    lastOpenedNoteId:
      patch.lastOpenedNoteId === undefined ? current.lastOpenedNoteId : patch.lastOpenedNoteId,
    recentNoteIds: patch.recentNoteIds ?? current.recentNoteIds,
  };
  saveSettings(db, next);
  return next;
}
