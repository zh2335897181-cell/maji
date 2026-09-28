/* =============================================================================
   码迹 · 课程读写
   -----------------------------------------------------------------------------
   行为对齐 src/lib/localRepository.ts：
   · 列表按 sortOrder 升序，相同则按写入顺序（rowid）
   · 新建时 sortOrder 取当前课程数量（不是最大值 +1）
   · 课程下还有笔记时拒绝删除，错误文案与浏览器实现逐字一致
   ============================================================================= */

import type { Course } from '../../../src/lib/types';
import { createId } from '../../../src/lib/text';
import { getDb } from './connection';
import {
  courseParams,
  selectOne,
  selectRows,
  toCourse,
  type CountRow,
  type CourseRow,
} from './mappers';

const SELECT_COURSES = 'SELECT * FROM courses ORDER BY sort_order ASC, rowid ASC';
const INSERT_COURSE = `
INSERT INTO courses (id, name, description, language, color_key, icon_key, sort_order, created_at, updated_at)
VALUES (@id, @name, @description, @language, @color_key, @icon_key, @sort_order, @created_at, @updated_at)`;

/** 课程补丁字段 -> 数据库列；id / updatedAt 不允许被补丁改写 */
const COURSE_COLUMNS: Record<string, string> = {
  name: 'name',
  description: 'description',
  language: 'language',
  colorKey: 'color_key',
  iconKey: 'icon_key',
  sortOrder: 'sort_order',
  createdAt: 'created_at',
};

export function listCourses(): Course[] {
  return selectRows<CourseRow>(getDb(), SELECT_COURSES).map(toCourse);
}

export function getCourse(id: string): Course | null {
  const row = selectOne<CourseRow>(getDb(), 'SELECT * FROM courses WHERE id = ?', [id]);
  return row ? toCourse(row) : null;
}

export function createCourse(input: Partial<Course> & { name: string }): Course {
  const db = getDb();
  const now = new Date().toISOString();
  const total = selectOne<CountRow>(db, 'SELECT COUNT(*) AS count FROM courses')?.count ?? 0;
  const course: Course = {
    id: input.id ?? createId('course'),
    name: input.name.trim(),
    description: input.description?.trim() ?? '',
    language: input.language ?? 'python',
    colorKey: input.colorKey ?? 'teal',
    iconKey: input.iconKey ?? 'book',
    sortOrder: total,
    createdAt: now,
    updatedAt: now,
  };
  db.prepare(INSERT_COURSE).run(courseParams(course));
  return course;
}

export function updateCourse(id: string, patch: Partial<Course>): Course {
  const db = getDb();
  if (!getCourse(id)) throw new Error(`课程不存在：${id}`);

  const assignments: string[] = [];
  const params: unknown[] = [];
  for (const [key, value] of Object.entries(patch)) {
    const column = COURSE_COLUMNS[key];
    if (!column || value === undefined) continue;
    assignments.push(`${column} = ?`);
    params.push(value);
  }
  assignments.push('updated_at = ?');
  params.push(new Date().toISOString(), id);
  db.prepare(`UPDATE courses SET ${assignments.join(', ')} WHERE id = ?`).run(...params);

  const updated = getCourse(id);
  if (!updated) throw new Error(`课程不存在：${id}`);
  return updated;
}

/** 仅允许删除没有笔记的课程；有笔记时抛出与浏览器实现相同的中文错误 */
export function deleteCourse(id: string): void {
  const db = getDb();
  const noteCount =
    selectOne<CountRow>(db, 'SELECT COUNT(*) AS count FROM notes WHERE course_id = ?', [id])
      ?.count ?? 0;
  if (noteCount > 0) throw new Error(`该课程下还有 ${noteCount} 篇笔记，请先移动或删除笔记`);
  db.prepare('DELETE FROM courses WHERE id = ?').run(id);
}

/** 按给定顺序重排；列表里没有的 id 直接忽略（与浏览器实现一致，不改 updatedAt） */
export function reorderCourses(orderedIds: string[]): void {
  const db = getDb();
  const statement = db.prepare('UPDATE courses SET sort_order = ? WHERE id = ?');
  const reorder = db.transaction(() => {
    orderedIds.forEach((id, index) => statement.run(index, id));
  });
  reorder();
}
