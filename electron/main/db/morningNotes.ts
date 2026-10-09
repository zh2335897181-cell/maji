import { getDb } from './connection';
import { createId } from '../../../src/lib/text';
import { validateMorningInput, type MorningInput, type MorningNote } from '../../../src/lib/morningNotes';
export function listMorningNotes(): MorningNote[] {
  const rows = getDb().prepare('SELECT document FROM morning_notes ORDER BY record_date DESC, updated_at DESC, id').all() as { document: string }[];
  return rows.map(row => JSON.parse(row.document) as MorningNote);
}
export function createMorningNote(value: MorningInput): MorningNote {
  const input = validateMorningInput(value), now = new Date().toISOString();
  const note: MorningNote = { ...input, id: createId('morning'), revision: 1, createdAt: now, updatedAt: now };
  getDb().prepare('INSERT INTO morning_notes (id, record_date, document, revision, updated_at) VALUES (?, ?, ?, ?, ?)').run(note.id, note.date, JSON.stringify(note), note.revision, now);
  return note;
}
export function updateMorningNote(id: string, value: MorningInput, revision: unknown): MorningNote {
  const input = validateMorningInput(value), db = getDb();
  if (!Number.isSafeInteger(revision) || (revision as number) < 1) throw new Error('晨考保存版本无效');
  return db.transaction(() => {
    const row = db.prepare('SELECT document, revision FROM morning_notes WHERE id=?').get(id) as { document: string; revision: number } | undefined;
    if (!row || row.revision !== revision) throw new Error('晨考已被修改或删除，请保留草稿后重新打开');
    const note: MorningNote = { ...JSON.parse(row.document), ...input, revision: row.revision + 1, updatedAt: new Date().toISOString() };
    db.prepare('UPDATE morning_notes SET record_date=?, document=?, revision=?, updated_at=? WHERE id=?').run(note.date, JSON.stringify(note), note.revision, note.updatedAt, id);
    return note;
  })();
}
