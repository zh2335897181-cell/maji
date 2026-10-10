import Database from 'better-sqlite3';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { migrate } from '../db/schema';
import { seedIfEmpty } from '../db/seed';
import { BackupService } from './service';
import { encodeBackup, readSnapshot, TABLES } from './format';
import { assertWritable } from './writeGate';
const dirs: string[] = [];
afterEach(async () => { for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true }); });
async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'maji-backup-')); dirs.push(dir);
  const db = new Database(':memory:'); migrate(db); seedIfEmpty(db);
  const service = new BackupService(db, dir, '0.5.6');
  const file = join(dir, 'manual.json'); await writeFile(file, encodeBackup(readSnapshot(db), '0.5.6'));
  return { dir, db, service, file };
}
it('previews without modifying data then restores with a safety backup', async () => {
  const { db, service, file } = await setup(); const before = readSnapshot(db);
  db.prepare('UPDATE notes SET title=? WHERE id=?').run('Changed', before.notes[0]!.id);
  const preview = await service.preview(file); expect(preview.counts.notes).toBe(before.notes.length);
  expect(readSnapshot(db)).not.toEqual(before);
  await service.restore(preview.token); expect(readSnapshot(db)).toEqual(before);
  expect((await service.status()).files.filter(f => f.kind === 'safety')).toHaveLength(1);
  await expect(service.restore(preview.token)).rejects.toThrow(); db.close();
});
it('blocks concurrent writes while the safety backup is being written', async () => {
  const {db,service,file}=await setup();const preview=await service.preview(file);
  const pending=service.restore(preview.token);
  expect(()=>assertWritable()).toThrow(/正在恢复/);
  await expect(service.exportTo(file)).rejects.toThrow(/等待/);
  await pending;expect(()=>assertWritable()).not.toThrow();db.close();
});
it('rejects changed current data after preview and preserves it', async () => {
  const { db, service, file } = await setup(); const preview = await service.preview(file);
  db.prepare('UPDATE notes SET title=?').run('new input');
  const before = readSnapshot(db);
  await expect(service.restore(preview.token)).rejects.toThrow(/变化/);
  expect(readSnapshot(db)).toEqual(before); db.close();
});
it('allows empty snapshots and preserves device settings', async () => {
  const { db, service, file } = await setup(); const settings = db.prepare('SELECT * FROM settings').all();
  await writeFile(file, encodeBackup(Object.fromEntries(TABLES.map(t => [t, []])) as unknown as ReturnType<typeof readSnapshot>, '0.5.6'));
  await service.restore((await service.preview(file)).token);
  expect(readSnapshot(db).courses).toHaveLength(0);
  expect(seedIfEmpty(db)).toBe(false);
  expect(db.prepare('SELECT * FROM settings WHERE key != ?').all('backup.initialized')).toEqual(settings); db.close();
});
it('daily backup skips unchanged data and retains seven', async () => {
  const { db, service } = await setup();
  for (let day = 1; day <= 9; day++) { db.prepare('UPDATE notes SET title=?').run(`Day ${day}`); await service.autoBackup(new Date(2026, 9, day, 10)); }
  expect((await service.status()).files.filter(f => f.kind === 'auto')).toHaveLength(7);
  await service.autoBackup(new Date(2026,9,10,10));
  expect((await service.status()).files.filter(f => f.kind === 'auto')).toHaveLength(7); db.close();
});
it('does not replace data when the safety backup cannot be written', async () => {
  const {db,service,file}=await setup(); const before=readSnapshot(db);
  await writeFile(service.directory, 'blocked');
  await expect(service.restore((await service.preview(file)).token)).rejects.toThrow();
  expect(readSnapshot(db)).toEqual(before); expect(()=>assertWritable()).not.toThrow(); db.close();
});
it('rolls back a failed insert after deletion and releases the write gate', async () => {
  const {db,service,file}=await setup();
  db.prepare('UPDATE notes SET title=?').run('retain me'); const before=readSnapshot(db);
  const preview=await service.preview(file);
  db.exec("CREATE TRIGGER fail_restore BEFORE INSERT ON notes BEGIN SELECT RAISE(ABORT, 'test insert failure'); END;");
  await expect(service.restore(preview.token)).rejects.toThrow('test insert failure');
  expect(readSnapshot(db)).toEqual(before); expect(()=>assertWritable()).not.toThrow(); db.close();
});
it('expires preview tokens and restores cached verified content rather than a replaced file', async () => {
  const {db,service,file}=await setup(); const before=readSnapshot(db);
  const token=(await service.preview(file)).token;
  const clock=vi.spyOn(Date,'now').mockReturnValue(Date.now()+301000);
  try { await expect(service.restore(token)).rejects.toThrow(/过期/); } finally {clock.mockRestore();}
  const preview=await service.preview(file); await writeFile(file,'changed file');
  await service.restore(preview.token); expect(readSnapshot(db)).toEqual(before); db.close();
});
it('retries automatic backup after a filesystem failure without recording success', async () => {
  const {db,service}=await setup(); await writeFile(service.directory,'blocked');
  await expect(service.autoBackup()).rejects.toThrow();
  expect(db.prepare('SELECT * FROM settings WHERE key=?').get('backup.config')).toBeUndefined();
  await rm(service.directory); await service.autoBackup();
  expect((await service.status()).lastSuccessAt).not.toBeNull(); db.close();
});
