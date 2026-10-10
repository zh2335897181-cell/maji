import { mkdtemp, rm, writeFile, readFile, readdir, open } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import { atomicWrite, readBackupFile, retainSeven, managedFiles } from './files';
import { encodeBackup, TABLES, MAX_BYTES, type BackupSnapshot } from './format';
const dirs: string[] = [];
afterEach(async()=>{for(const dir of dirs.splice(0))await rm(dir,{recursive:true,force:true});});
async function directory(){const dir=await mkdtemp(join(tmpdir(),'maji-backup-files-'));dirs.push(dir);return dir;}
it('atomically replaces an export and leaves no temporary files',async()=>{
  const dir=await directory(),file=join(dir,'manual.json');
  await atomicWrite(file,'old');await atomicWrite(file,'new');
  expect(await readFile(file,'utf8')).toBe('new');expect(await readdir(dir)).toEqual(['manual.json']);
});
it('rejects oversized files before reading their contents',async()=>{
  const dir=await directory(),file=join(dir,'large.json'),handle=await open(file,'w');
  try {await handle.truncate(MAX_BYTES+1);}finally {await handle.close();}
  await expect(readBackupFile(file)).rejects.toThrow(/100 MiB/);
});
it('retains seven safety backups without touching manual or damaged files',async()=>{
  const dir=await directory(),tables=Object.fromEntries(TABLES.map(t=>[t,[]])) as unknown as BackupSnapshot;
  for(let day=1;day<=9;day++){const now=new Date(2026,9,day);await atomicWrite(join(dir,`maji-safety-${now.getTime()}-${randomUUID()}.json`),encodeBackup(tables,'0.5.6',now));}
  const bad=`maji-safety-${Date.now()}-${randomUUID()}.json`;
  await writeFile(join(dir,bad),'damaged');await writeFile(join(dir,'manual.json'),'keep');
  await retainSeven(dir,'safety');expect(await managedFiles(dir)).toHaveLength(7);
  expect(await readdir(dir)).toHaveLength(9);expect(await readFile(join(dir,bad),'utf8')).toBe('damaged');
});
