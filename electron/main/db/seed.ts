/* =============================================================================
   码迹 · 空库播种
   -----------------------------------------------------------------------------
   只在 courses 表为空时写入示例数据（courses / notes / snippets /
   exercises / review_items / settings），全部在一个事务里完成：
   中途失败就整体回滚，不会留下半套数据让界面显示成空壳。
   示例数据本身来自 src/lib/demoData.ts，与浏览器开发模式完全一致。
   ============================================================================= */

import { createSeedData } from '../../../src/lib/demoData';
import type { SqliteDatabase } from './connection';
import {
  courseParams,
  deriveCodeText,
  exerciseParams,
  noteParams,
  reviewParams,
  selectOne,
  settingsParams,
  snippetParams,
  type CountRow,
} from './mappers';

const INSERT_COURSE = `
INSERT INTO courses (id, name, description, language, track, color_key, icon_key, sort_order, created_at, updated_at)
VALUES (@id, @name, @description, @language, @track, @color_key, @icon_key, @sort_order, @created_at, @updated_at)`;

const INSERT_NOTE = `
INSERT INTO notes (id, course_id, title, content_json, content_text, code_text, excerpt, language, tags, favorite, archived, created_at, updated_at, last_opened_at)
VALUES (@id, @course_id, @title, @content_json, @content_text, @code_text, @excerpt, @language, @tags, @favorite, @archived, @created_at, @updated_at, @last_opened_at)`;

const INSERT_SNIPPET = `
INSERT INTO snippets (id, title, language, code, description, output, course_id, note_id, created_at, updated_at)
VALUES (@id, @title, @language, @code, @description, @output, @course_id, @note_id, @created_at, @updated_at)`;

const INSERT_EXERCISE = `
INSERT INTO exercises (id, title, prompt, hint, solution, language, difficulty, done, course_id, note_id, created_at, updated_at)
VALUES (@id, @title, @prompt, @hint, @solution, @language, @difficulty, @done, @course_id, @note_id, @created_at, @updated_at)`;

const INSERT_REVIEW = `
INSERT INTO review_items (id, title, summary, note_id, course_id, state, due_at, last_reviewed_at, review_count, mastered_streak, confidence, created_at, updated_at)
VALUES (@id, @title, @summary, @note_id, @course_id, @state, @due_at, @last_reviewed_at, @review_count, @mastered_streak, @confidence, @created_at, @updated_at)`;

const INSERT_SETTING = `
INSERT INTO settings (key, value) VALUES (@key, @value)
ON CONFLICT(key) DO UPDATE SET value = excluded.value`;

/** 返回是否真的写入了示例数据 */
export function seedIfEmpty(db: SqliteDatabase): boolean {
  const existing = selectOne<CountRow>(db, 'SELECT COUNT(*) AS count FROM courses');
  if ((existing?.count ?? 0) > 0) return false;

  const data = createSeedData();
  const write = db.transaction(() => {
    const insertCourse = db.prepare(INSERT_COURSE);
    for (const course of data.courses) insertCourse.run(courseParams(course));

    const insertNote = db.prepare(INSERT_NOTE);
    for (const note of data.notes) {
      insertNote.run(noteParams(note, deriveCodeText(note.contentJson)));
    }

    const insertSnippet = db.prepare(INSERT_SNIPPET);
    for (const snippet of data.snippets) insertSnippet.run(snippetParams(snippet));

    const insertExercise = db.prepare(INSERT_EXERCISE);
    for (const exercise of data.exercises) insertExercise.run(exerciseParams(exercise));

    const insertReview = db.prepare(INSERT_REVIEW);
    for (const item of data.reviewItems) insertReview.run(reviewParams(item));

    // 首次启动的现场：lastOpenedNoteId = note_func_args，recentNoteIds 见 demoData
    const insertSetting = db.prepare(INSERT_SETTING);
    for (const entry of settingsParams(data.settings)) insertSetting.run(entry);
  });

  write();
  return true;
}
