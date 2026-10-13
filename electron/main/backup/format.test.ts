import Database from 'better-sqlite3';
import { afterAll, expect, it } from 'vitest';
import { migrate } from '../db/schema';
import { seedIfEmpty } from '../db/seed';
import { createHash } from 'node:crypto';
import { newExam } from '../../../src/lib/exams';
import { readSnapshot, encodeBackup, decodeBackup, contentDigest } from './format';
const db = new Database(':memory:'); migrate(db); seedIfEmpty(db);
afterAll(() => db.close());
it('recovers legacy null ordered-list starts without losing list content', () => {
  const snapshot = readSnapshot(db);
  const doc = {type:'doc',content:[{type:'orderedList',attrs:{start:null},content:[{type:'listItem',content:[{type:'paragraph',content:[{type:'text',text:'保留题目内容'}]}]}]}]};
  snapshot.notes[0]!.content_json=JSON.stringify(doc);
  const restored=decodeBackup(encodeBackup(snapshot,'0.6.1'));
  expect(JSON.parse(String(restored.tables.notes[0]!.content_json)).content[0].attrs.start).toBe(1);
  expect(restored.tables.notes[0]!.content_json).toContain('保留题目内容');
});
it.each([-1,1.5,'bad'])('still rejects invalid list starts %s', start => {
  const snapshot=readSnapshot(db);
  snapshot.notes[0]!.content_json=JSON.stringify({type:'doc',content:[{type:'orderedList',attrs:{start},content:[{type:'listItem',content:[{type:'paragraph'}]}]}]});
  expect(()=>decodeBackup(encodeBackup(snapshot,'0.6.1'))).toThrow('数值属性');
});
it('preserves project files and training records in exam backups',()=>{
  const snapshot=readSnapshot(db),exam=newExam('项目考试');exam.revision=1;
  exam.questions[0]!.files=[{id:'file_1',path:'service/Emp.java',role:'Service',language:'java',content:'class Emp {}'}];
  snapshot.exam_records.push({id:exam.id,document:JSON.stringify(exam),revision:1,updated_at:exam.updatedAt});
  expect(decodeBackup(encodeBackup(snapshot,'0.5.7')).tables.exam_records).toEqual(snapshot.exam_records);
});
it('restores schema 6 backups by adding an empty exam table after checksum verification',()=>{
  const value=JSON.parse(encodeBackup(readSnapshot(db),'0.5.7'));value.schemaVersion=6;delete value.tables.exam_records;
  const {checksum:_checksum,...payload}=value;
  const canonical=(v:any):string=>Array.isArray(v)?`[${v.map(canonical).join(',')}]`:v&&typeof v==='object'?`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`:JSON.stringify(v);
  value.checksum=createHash('sha256').update(canonical(payload)).digest('hex');
  expect(decodeBackup(JSON.stringify(value)).tables.exam_records).toEqual([]);
  value.schemaVersion=5;expect(()=>decodeBackup(JSON.stringify(value))).toThrow('不兼容');
});
it('rejects dangerous keys inside nested document attributes', () => {
  const snapshot = readSnapshot(db);
  snapshot.notes[0]!.content_json = '{"type":"doc","content":[{"type":"paragraph","attrs":{"__proto__":{"polluted":true}}}]}';
  expect(() => decodeBackup(encodeBackup(snapshot, '0.5.6'))).toThrow(/危险/);
});
it('rejects extra fields, duplicate IDs, invalid languages and malformed documents', () => {
  const original=readSnapshot(db);
  for(const change of [
    (value:typeof original)=>{value.notes[0]!.unexpected='bad';},
    (value:typeof original)=>{value.notes.push({...value.notes[0]!});},
    (value:typeof original)=>{value.notes[0]!.language='unknown';},
    (value:typeof original)=>{value.notes[0]!.content_json='{"type":"wrong"}';},
  ]) {const value=structuredClone(original);change(value);expect(()=>decodeBackup(encodeBackup(value,'0.5.6'))).toThrow();}
});
it.each([
  {type:'doc',content:[{type:'text'}]},
  {type:'doc',content:[{type:'unknownNode'}]},
  {type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'text',marks:[{type:'unknownMark'}]}]}]},
  {type:'doc',content:[{type:'paragraph',content:[{type:'paragraph'}]}]},
  {type:'doc',content:[{type:'callout',attrs:{variant:'unknown'},content:[{type:'paragraph'}]}]},
  {type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'x',marks:[{type:'link',attrs:{href:{bad:true}}}]}]}]},
])('rejects content the editor would otherwise replace with a blank document',doc=>{
  const snapshot=readSnapshot(db);snapshot.notes[0]!.content_json=JSON.stringify(doc);
  expect(()=>decodeBackup(encodeBackup(snapshot,'0.5.6'))).toThrow();
});
it('round trips all learning tables but excludes settings and credentials', () => {
  const snapshot = readSnapshot(db);
  const raw = encodeBackup(snapshot, '0.5.6');
  expect(decodeBackup(raw).tables).toEqual(snapshot);
  expect(Object.keys(snapshot)).not.toContain('settings');
  expect(raw).not.toContain('encryptedKey');
});
it('rejects damaged files, foreign versions and invalid references', () => {
  const snapshot = readSnapshot(db), raw = encodeBackup(snapshot, '0.5.6');
  expect(() => decodeBackup(raw.replace('Python 入门', 'Damaged'))).toThrow();
  const invalid = structuredClone(snapshot); invalid.notes[0]!.course_id = 'missing';
  expect(() => decodeBackup(encodeBackup(invalid, '0.5.6'))).toThrow();
  expect(() => decodeBackup(raw.replace('"formatVersion":1', '"formatVersion":9'))).toThrow();
});
it('ignores pure browsing changes in daily digest while preserving them in backup', () => {
  const snapshot = readSnapshot(db), next = structuredClone(snapshot);
  next.notes[0]!.last_opened_at = new Date().toISOString();
  expect(contentDigest(next)).toBe(contentDigest(snapshot));
  next.notes[0]!.title = 'Changed'; expect(contentDigest(next)).not.toBe(contentDigest(snapshot));
});
