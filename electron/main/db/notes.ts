/* =============================================================================
   码迹 · 笔记读写与搜索
   -----------------------------------------------------------------------------
   与 src/lib/localRepository.ts 的行为逐条对齐：
   · 默认只返回未归档笔记；archived === undefined 才算“默认”
   · updatedAt 是列表排序键：新版在前，时间相同按写入顺序
   · 搜索先用 SQL 粗筛（foreign key、课程、语言、收藏 + ASCII 关键词），
     再用共享的 searchDocuments 精确打分排序，结果与浏览器实现一致
   · 每次改正文都用 docToPlainText + toExcerpt 重新派生摘要
   ============================================================================= */

import type { Note, NoteInput, NoteListFilter, NotePatch, NoteSummary, SearchQuery, SearchResult } from '../../../src/lib/types';
import { createId, tokenizeQuery } from '../../../src/lib/text';
import { docToPlainText, extractCodeText, noteExcerpt, starterDoc, type Doc } from '../../../src/lib/noteDoc';
import { searchDocuments, type SearchDocument } from '../../../src/lib/search';
import type { SqliteDatabase } from './connection';
import { getDb } from './connection';
import { getCourse } from './courses';
import { loadSettings, saveSettings } from './library';
import {
  asLanguage,
  noteParams,
  selectOne,
  selectRows,
  toNote,
  toNoteSummary,
  toSearchDocument,
  type NoteRow,
  type SnippetRow,
} from './mappers';

const SELECT_NOTES = `
SELECT n.id, n.course_id, n.title, n.content_json, n.content_text, n.code_text, n.excerpt,
       n.language, n.tags, n.favorite, n.archived, n.created_at, n.updated_at, n.last_opened_at,
       c.name AS course_name, c.color_key AS course_color_key
FROM notes n
LEFT JOIN courses c ON c.id = n.course_id`;

const INSERT_NOTE = `
INSERT INTO notes (id, course_id, title, content_json, content_text, code_text, excerpt, language, tags, favorite, archived, created_at, updated_at, last_opened_at)
VALUES (@id, @course_id, @title, @content_json, @content_text, @code_text, @excerpt, @language, @tags, @favorite, @archived, @created_at, @updated_at, @last_opened_at)`;

/** 笔记补丁字段 -> 数据库列 */
const NOTE_COLUMNS: Record<string, string> = {
  title: 'title',
  courseId: 'course_id',
  contentJson: 'content_json',
  contentText: 'content_text',
  excerpt: 'excerpt',
  language: 'language',
  tags: 'tags',
  favorite: 'favorite',
  archived: 'archived',
  lastOpenedAt: 'last_opened_at',
};

/** SQLite 只接受 number / string / null，这里把布尔和数组转成列里该有的样子 */
function encodePatchValue(key: string, value: unknown): unknown {
  if (key === 'tags') return JSON.stringify(Array.isArray(value) ? value : []);
  if (key === 'favorite' || key === 'archived') return value ? 1 : 0;
  return value;
}

export function listNotes(filter: NoteListFilter = {}): NoteSummary[] {
  const db = getDb();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filter.courseId) {
    conditions.push('n.course_id = ?');
    params.push(filter.courseId);
  }
  if (filter.tag) {
    conditions.push('EXISTS (SELECT 1 FROM json_each(n.tags) WHERE json_each.value = ?)');
    params.push(filter.tag);
  }
  if (filter.favorite) conditions.push('n.favorite = 1');
  if (filter.language) {
    conditions.push('n.language = ?');
    params.push(filter.language);
  }
  if (filter.archived === undefined) conditions.push('n.archived = 0');
  else {
    conditions.push('n.archived = ?');
    params.push(filter.archived ? 1 : 0);
  }

  const limit = typeof filter.limit === 'number' && filter.limit > 0 ? Math.floor(filter.limit) : 0;
  // filter.search 在 JS 里过滤（原因见文件头注释），所以此时不能在 SQL 里 LIMIT
  const searchLimit = limit > 0 && !filter.search ? limit : 0;
  const sql = `${SELECT_NOTES} WHERE ${conditions.join(' AND ')} ORDER BY n.updated_at DESC, n.rowid ASC${
    searchLimit ? ' LIMIT ?' : ''
  }`;
  let rows = selectRows<NoteRow>(db, sql, searchLimit ? [...params, searchLimit] : params);

  if (filter.search) {
    const keyword = filter.search.toLowerCase();
    rows = rows.filter(
      (row) =>
        row.title.toLowerCase().includes(keyword) ||
        row.content_text.toLowerCase().includes(keyword),
    );
    if (limit > 0) rows = rows.slice(0, limit);
  }

  return rows.map(toNoteSummary);
}

export function getNote(id: string): Note | null {
  const row = selectOne<NoteRow>(getDb(), `${SELECT_NOTES} WHERE n.id = ?`, [id]);
  return row ? toNote(row) : null;
}

export function createNote(input: NoteInput): Note {
  const db = getDb();
  const now = new Date().toISOString();
  const content: Doc = input.contentJson
    ? (JSON.parse(input.contentJson) as Doc)
    : starterDoc(input.title);
  const plain = docToPlainText(content);
  const note: Note = {
    id: createId('note'),
    courseId: input.courseId,
    title: input.title.trim() || '未命名笔记',
    contentJson: JSON.stringify(content),
    contentText: plain,
    excerpt: noteExcerpt(content, plain),
    language: input.language,
    tags: input.tags ?? [],
    favorite: false,
    archived: false,
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
  };
  db.prepare(INSERT_NOTE).run(noteParams(note, extractCodeText(content)));
  return note;
}

export function updateNote(id: string, patch: NotePatch): Note {
  const db = getDb();
  if (!getNote(id)) throw new Error(`笔记不存在：${id}`);

  const assignments: string[] = [];
  const params: unknown[] = [];
  for (const [key, value] of Object.entries(patch)) {
    const column = NOTE_COLUMNS[key];
    if (!column || value === undefined) continue;
    assignments.push(`${column} = ?`);
    params.push(encodePatchValue(key, value));
  }

  // 正文变了就重新派生纯文本、摘要与代码文本（与浏览器实现共用同一批纯函数）
  if (patch.contentJson) {
    const content = JSON.parse(patch.contentJson) as Doc;
    const plain = docToPlainText(content);
    assignments.push('content_text = ?', 'excerpt = ?', 'code_text = ?');
    params.push(plain, noteExcerpt(content, plain), extractCodeText(content));
  }

  assignments.push('updated_at = ?');
  params.push(patch.lastOpenedAt ?? new Date().toISOString(), id);
  db.prepare(`UPDATE notes SET ${assignments.join(', ')} WHERE id = ?`).run(...params);

  const updated = getNote(id);
  if (!updated) throw new Error(`笔记不存在：${id}`);
  return updated;
}

/**
 * 删除笔记：review_items 由外键级联删除，exercises / snippets 的 note_id 置空，
 * 同时把它从 settings 的最近打开列表里摘掉（与浏览器实现一致）。
 */
export function deleteNote(id: string): void {
  const db = getDb();
  const remove = db.transaction(() => {
    db.prepare('DELETE FROM notes WHERE id = ?').run(id);
    const settings = loadSettings(db);
    const recentNoteIds = settings.recentNoteIds.filter((noteId) => noteId !== id);
    const lastOpenedNoteId =
      settings.lastOpenedNoteId === id ? recentNoteIds[0] ?? null : settings.lastOpenedNoteId;
    if (
      lastOpenedNoteId !== settings.lastOpenedNoteId ||
      recentNoteIds.length !== settings.recentNoteIds.length
    ) {
      saveSettings(db, { ...settings, recentNoteIds, lastOpenedNoteId });
    }
  });
  remove();
}

/** 记录“刚刚打开过”：只更新 lastOpenedAt 与最近打开列表，不动 updatedAt */
export function touchNote(id: string): void {
  const db = getDb();
  const now = new Date().toISOString();
  const touch = db.transaction(() => {
    const changed = db.prepare('UPDATE notes SET last_opened_at = ? WHERE id = ?').run(now, id)
      .changes;
    if (changed === 0) return;
    const settings = loadSettings(db);
    const recentNoteIds = [id, ...settings.recentNoteIds.filter((noteId) => noteId !== id)].slice(
      0,
      6,
    );
    saveSettings(db, { ...settings, recentNoteIds, lastOpenedNoteId: id });
  });
  touch();
}

/* ------------------------------------------------------------------ 搜索 */

const ASCII_KEYWORD = /^[\x20-\x7e]+$/;

/**
 * SQL 粗筛：要求“每个关键词至少命中一个字段”，是精确匹配的超集。
 * 关键词含非 ASCII 字符时（中文、西欧字母大小写）SQLite 的 lower() 不会折叠，
 * 直接跳过粗筛交给 searchDocuments 判定，宁可多读几行也不能漏结果。
 */
function coarseTextFilter(
  keywords: string[],
  includeCode: boolean,
): { clause: string; params: unknown[] } | null {
  if (keywords.length === 0) return null;
  if (!keywords.every((keyword) => ASCII_KEYWORD.test(keyword))) return null;

  const clauses: string[] = [];
  const params: unknown[] = [];
  for (const keyword of keywords) {
    const fields = [
      'instr(lower(n.title), ?) > 0',
      'instr(lower(n.content_text), ?) > 0',
      'EXISTS (SELECT 1 FROM json_each(n.tags) WHERE instr(lower(json_each.value), ?) > 0)',
    ];
    params.push(keyword, keyword, keyword);
    if (includeCode) {
      fields.push('instr(lower(n.code_text), ?) > 0');
      params.push(keyword);
    }
    clauses.push(`(${fields.join(' OR ')})`);
  }
  return { clause: clauses.join(' AND '), params };
}

function candidateRows(db: SqliteDatabase, query: SearchQuery, keywords: string[]): NoteRow[] {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (query.courseId) {
    conditions.push('n.course_id = ?');
    params.push(query.courseId);
  }
  if (query.language) {
    conditions.push('n.language = ?');
    params.push(query.language);
  }
  if (query.favoriteOnly) conditions.push('n.favorite = 1');

  const coarse = coarseTextFilter(keywords, query.includeCode !== false);
  if (coarse) {
    conditions.push(coarse.clause);
    params.push(...coarse.params);
  }

  const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
  return selectRows<NoteRow>(db, `${SELECT_NOTES}${where} ORDER BY n.rowid ASC`, params);
}

/** 代码片段也参与搜索：命中后指向它关联的笔记（与浏览器实现同一套规则） */
function searchSnippets(query: SearchQuery): SearchResult[] {
  const keyword = query.text.trim().toLowerCase();
  if (!keyword) return [];

  const results: SearchResult[] = [];
  const db = getDb();
  for (const row of selectRows<SnippetRow>(db, 'SELECT * FROM snippets ORDER BY rowid ASC')) {
    if (!row.note_id) continue;
    const note = selectOne<NoteRow>(db, 'SELECT * FROM notes WHERE id = ?', [row.note_id]);
    const courseId = row.course_id ?? note?.course_id ?? '';
    if (query.courseId && courseId !== query.courseId) continue;
    if (query.language && asLanguage(row.language) !== query.language) continue;
    if (query.favoriteOnly && note?.favorite !== 1) continue;
    const haystack = `${row.title} ${row.description}${query.includeCode === false ? '' : ` ${row.code}`}`.toLowerCase();
    if (!haystack.includes(keyword)) continue;
    const course = courseId ? getCourse(courseId) : null;
    results.push({
      noteId: row.note_id,
      title: row.title,
      courseId,
      courseName: course?.name ?? '',
      courseColorKey: 'teal',
      language: asLanguage(row.language),
      updatedAt: row.updated_at,
      favorite: note?.favorite === 1,
      tags: [],
      hitField: 'code',
      snippet: `${row.title} · ${row.description}`,
      score: 2,
    });
  }
  return results;
}

export function searchNotes(query: SearchQuery): SearchResult[] {
  const db = getDb();
  const keywords = tokenizeQuery(query.text);
  const documents: SearchDocument[] = candidateRows(db, query, keywords).map(toSearchDocument);

  const merged = [...searchDocuments(documents, query)];
  for (const snippetResult of searchSnippets(query)) {
    if (!merged.some((item) => item.noteId === snippetResult.noteId)) merged.push(snippetResult);
  }
  return typeof query.limit === 'number' ? merged.slice(0, query.limit) : merged;
}
