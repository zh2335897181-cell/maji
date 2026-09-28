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
  selectOne,
  selectRows,
  settingsParams,
  snippetParams,
  toExercise,
  toReviewItem,
  toReviewItemWithNote,
  toSettings,
  toSnippet,
  type ExerciseRow,
  type ReviewRow,
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
