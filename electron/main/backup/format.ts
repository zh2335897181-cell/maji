import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import type { SqliteDatabase } from '../db/connection';
import { migrate, SCHEMA_VERSION } from '../db/schema';
import { validateDraft, validateView } from '../../../src/lib/mindmap';
import { validateMorningInput } from '../../../src/lib/morningNotes';
import { validateReviewGrade, validateReviewSessionInput, validateReviewSessionPatch } from '../ipc/validate';
import { getSchema } from '@tiptap/core';
import { buildContentExtensions } from '../../../src/lib/editorContent';
const documentSchema = getSchema(buildContentExtensions());

export const TABLES = ['courses', 'notes', 'snippets', 'exercises', 'review_items', 'review_sessions', 'review_questions', 'mind_maps', 'mind_map_views', 'morning_notes'] as const;
export type Table = typeof TABLES[number];
export type Row = Record<string, string | number | null>;
export type BackupSnapshot = Record<Table, Row[]>;
export const MAX_BYTES = 100 * 1024 * 1024;
type Payload = { format: 'maji-backup'; formatVersion: 1; schemaVersion: number; appVersion: string; createdAt: string; tables: BackupSnapshot };
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
const hash = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
function safeJson(value: unknown, depth = 0): void {
  if (depth > 100) throw new Error('备份数据层级过深');
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('备份包含危险字段');
      safeJson(child, depth + 1);
    }
  }
}
function parseJson(value: unknown): any {
  const parsed = JSON.parse(String(value)); safeJson(parsed); return parsed;
}
export function readSnapshot(db: SqliteDatabase): BackupSnapshot {
  return db.transaction(() => Object.fromEntries(TABLES.map(table => [table, db.prepare(`SELECT * FROM ${table} ORDER BY ${table === 'mind_map_views' ? 'map_id' : 'id'}`).all()])) as BackupSnapshot)();
}
export function contentDigest(tables: BackupSnapshot): string {
  const value = structuredClone(tables); value.mind_map_views = [];
  for (const row of value.notes) row.last_opened_at = null;
  return hash(value);
}
export function encodeBackup(tables: BackupSnapshot, appVersion: string, now = new Date()): string {
  const payload: Payload = { format: 'maji-backup', formatVersion: 1, schemaVersion: SCHEMA_VERSION, appVersion, createdAt: now.toISOString(), tables };
  const raw = JSON.stringify({ ...payload, checksum: hash(payload) });
  if (Buffer.byteLength(raw) > MAX_BYTES) throw new Error('备份超过 100 MiB 上限');
  return raw;
}
export function insertSnapshot(db: SqliteDatabase, tables: BackupSnapshot): void {
  for (const table of TABLES) {
    const columns = (db.pragma(`table_info(${table})`) as { name: string }[]).map(c => c.name);
    const statement = db.prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`);
    for (const row of tables[table]) statement.run(...columns.map(column => row[column]));
  }
}
function checkDoc(value: unknown): void {
  if (!value || typeof value !== 'object' || (value as {type?:unknown}).type !== 'doc' || !Array.isArray((value as {content?:unknown}).content)) throw new Error('笔记正文结构无效');
  checkAttributes(value as Record<string,unknown>, false);
  const stack: unknown[] = [(value as {content:unknown[]}).content]; let count = 0;
  while (stack.length) {
    const item = stack.pop(); if (++count > 100000) throw new Error('笔记正文过于复杂');
    if (Array.isArray(item)) stack.push(...item);
    else if (item && typeof item === 'object') {
      const node = item as Record<string,unknown>;
      if (typeof node.type !== 'string') throw new Error('笔记节点无效');
      if (node.text !== undefined && node.type !== 'text' || node.type === 'text' && node.content !== undefined) throw new Error('笔记文本节点无效');
      checkAttributes(node, false);
      if (node.marks !== undefined) {
        if (!Array.isArray(node.marks)) throw new Error('笔记标记无效');
        for (const mark of node.marks) { if (!mark || typeof mark !== 'object') throw new Error('笔记标记无效'); checkAttributes(mark, true); }
      }
      if (node.content !== undefined) { if (!Array.isArray(node.content)) throw new Error('笔记节点内容无效'); stack.push(node.content); }
    }
    else throw new Error('笔记节点无效');
  }
  documentSchema.nodeFromJSON(value).check();
}
function checkAttributes(node: Record<string,unknown>, mark: boolean): void {
  const type = (mark ? documentSchema.marks : documentSchema.nodes)[String(node.type)];
  if (!type) throw new Error('笔记包含不支持的节点或标记');
  if (node.attrs === undefined) return;
  if (!node.attrs || typeof node.attrs !== 'object' || Array.isArray(node.attrs)) throw new Error('笔记属性无效');
  for (const [key,value] of Object.entries(node.attrs)) {
    if (!Object.hasOwn(type.spec.attrs ?? {}, key)) throw new Error('笔记包含不支持的属性');
    if (key === 'variant') { if (!['note','tip','warning','output'].includes(String(value))) throw new Error('说明块类型无效'); }
    else if (key === 'checked') { if (typeof value !== 'boolean') throw new Error('任务状态无效'); }
    else if (key === 'colwidth') { if (value !== null && (!Array.isArray(value) || value.some(v => typeof v !== 'number' || !Number.isFinite(v) || v < 0))) throw new Error('表格列宽无效'); }
    else if (['level','start','colspan','rowspan'].includes(key)) { if (!Number.isSafeInteger(value) || Number(value) < (key === 'start' ? 0 : 1) || (key === 'level' && Number(value) > 6)) throw new Error('笔记数值属性无效'); }
    else if (['width','height'].includes(key)) { if (value !== null && !(typeof value === 'number' && Number.isFinite(value) && value >= 0) && !(typeof value === 'string' && /^\d+(\.\d+)?(px|%)?$/.test(value))) throw new Error('图片尺寸无效'); }
    else if (value !== null && typeof value !== 'string') throw new Error('笔记文本属性无效');
  }
}
export function decodeBackup(raw: string): Payload {
  if (Buffer.byteLength(raw) > MAX_BYTES) throw new Error('备份超过 100 MiB 上限');
  let value: Record<string,unknown>;
  try { value = JSON.parse(raw); } catch { throw new Error('备份文件不是有效 JSON'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('备份格式无效');
  safeJson(value);
  const { checksum, ...payload } = value;
  if (Object.keys(value).sort().join(',') !== 'appVersion,checksum,createdAt,format,formatVersion,schemaVersion,tables' || value.format !== 'maji-backup' || value.formatVersion !== 1 || value.schemaVersion !== SCHEMA_VERSION) throw new Error('备份版本不兼容，请使用对应版本的码迹');
  if (typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt)) || typeof value.appVersion !== 'string') throw new Error('备份信息无效');
  if (checksum !== hash(payload)) throw new Error('备份校验失败，文件可能已损坏');
  const tables = value.tables as BackupSnapshot;
  if (!tables || Object.keys(tables).sort().join(',') !== [...TABLES].sort().join(',')) throw new Error('备份数据表不完整');
  const db = new Database(':memory:');
  try {
    migrate(db); db.pragma('foreign_keys = ON');
    for (const table of TABLES) {
      if (!Array.isArray(tables[table])) throw new Error('备份记录无效');
      const columns = db.pragma(`table_info(${table})`) as { name: string; type: string; notnull: number; pk: number }[];
      for (const row of tables[table]) {
        if (!row || typeof row !== 'object' || Object.keys(row).sort().join(',') !== columns.map(c => c.name).sort().join(',')) throw new Error('备份字段无效');
        for (const c of columns) {
          const cell = row[c.name];
          if (cell === null && !c.notnull && !c.pk) continue;
          if (c.type === 'INTEGER' ? !Number.isSafeInteger(cell) : typeof cell !== 'string') throw new Error('备份字段类型无效');
          if (c.pk && (typeof cell !== 'string' || !cell.length || cell.length > 200)) throw new Error('备份 ID 无效');
          if (/_at$/.test(c.name) && !Number.isFinite(Date.parse(String(cell)))) throw new Error('备份日期无效');
          if (['favorite','archived','done'].includes(c.name) && ![0,1].includes(Number(cell))) throw new Error('备份布尔字段无效');
          if (['revision','duration_seconds','question_order','planned_question_count','review_count','mastered_streak'].includes(c.name) && Number(cell) < 0) throw new Error('备份数值无效');
        }
        if (row.language && !['python','javascript','typescript','html','css','java','c','text'].includes(String(row.language))) throw new Error('备份语言无效');
        if (row.difficulty && !['easy','medium','hard'].includes(String(row.difficulty))) throw new Error('备份难度无效');
        if (table === 'notes') { checkDoc(parseJson(row.content_json)); const tags = parseJson(row.tags); if (!Array.isArray(tags) || tags.some(t => typeof t !== 'string')) throw new Error('笔记标签无效'); }
        if (table === 'review_items' && !['due','scheduled','mastered','archived'].includes(String(row.state))) throw new Error('复习状态无效');
        if (table === 'review_sessions') {
          if (!['due','course','notes'].includes(String(row.scope)) || !['in-progress','completed'].includes(String(row.status)) || !['quick','standard','deep'].includes(String(row.depth))) throw new Error('练习记录状态无效');
          const questions = tables.review_questions.filter(q => q.session_id === row.id).map(q => ({ type:q.type, difficulty:q.difficulty, title:q.title, prompt:q.prompt, hint:q.hint, referenceAnswer:q.reference_answer, explanation:q.explanation, language:q.language, sourceNoteId:q.source_note_id }));
          validateReviewSessionInput({scope:row.scope, depth:row.depth, plannedQuestionCount:row.planned_question_count, sources:parseJson(row.sources), questions});
          validateReviewSessionPatch({activeSegments:parseJson(row.active_segments),activeSegmentStartedAt:row.active_segment_started_at,endedAt:row.ended_at});
        }
        if (table === 'review_questions' && row.grade) validateReviewGrade(parseJson(row.grade));
        if (table === 'mind_maps') { const doc = parseJson(row.document); validateDraft(doc); if (doc.id !== row.id || doc.revision !== row.revision) throw new Error('导图记录不一致'); }
        if (table === 'mind_map_views') validateView(parseJson(row.state));
        if (table === 'morning_notes') { const doc = parseJson(row.document); validateMorningInput(doc); checkDoc(parseJson(doc.contentJson)); if (doc.id !== row.id || doc.revision !== row.revision || doc.date !== row.record_date) throw new Error('晨考记录不一致'); }
      }
    }
    insertSnapshot(db, tables);
    if ((db.pragma('foreign_key_check') as unknown[]).length) throw new Error('备份关联无效');
  } catch (error) { throw new Error(`备份数据验证失败：${error instanceof Error ? error.message : '无效数据'}`); }
  finally { db.close(); }
  return payload as Payload;
}
