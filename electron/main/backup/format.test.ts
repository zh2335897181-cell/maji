import Database from 'better-sqlite3';
import { afterAll, expect, it } from 'vitest';
import { migrate } from '../db/schema';
import { seedIfEmpty } from '../db/seed';
import { readSnapshot, encodeBackup, decodeBackup, contentDigest } from './format';
const db = new Database(':memory:'); migrate(db); seedIfEmpty(db);
afterAll(() => db.close());
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
