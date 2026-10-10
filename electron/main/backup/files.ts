import { open, mkdir, rename, unlink, readdir, lstat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { decodeBackup, MAX_BYTES } from './format';
export async function readBackupFile(file: string): Promise<string> {
  const info = await lstat(file);
  if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_BYTES) throw new Error('备份文件无效或超过 100 MiB');
  const handle = await open(file, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > MAX_BYTES) throw new Error('备份文件无效或超过 100 MiB');
    const buffer = Buffer.alloc(stat.size + 1);
    let length = 0;
    while (length < buffer.length) {
      const {bytesRead} = await handle.read(buffer, length, buffer.length - length, null);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > stat.size) throw new Error('备份文件正在变化，请重试');
    return buffer.subarray(0,length).toString('utf8');
  } finally { await handle.close(); }
}
export async function atomicWrite(target: string, content: string): Promise<void> {
  await mkdir(resolve(target, '..'), { recursive: true });
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    const handle = await open(temporary, 'wx', 0o600);
    try { await handle.writeFile(content, 'utf8'); await handle.sync(); } finally { await handle.close(); }
    await rename(temporary, target);
  } finally { await unlink(temporary).catch(() => {}); }
}
export async function managedFiles(directory: string) {
  await mkdir(directory, { recursive: true });
  const files: Array<{ name: string; createdAt: string; kind: 'auto'|'safety' }> = [];
  for (const name of await readdir(directory)) {
    if (!/^maji-(auto|safety)-\d{13}-[\da-f-]{36}\.json$/.test(name)) continue;
    try { const file = join(directory, name); const data = decodeBackup(await readBackupFile(file)); files.push({name, createdAt: data.createdAt, kind: name.startsWith('maji-auto-')?'auto':'safety'}); } catch { /* Unrecognized or damaged files are never deleted. */ }
  }
  return files.sort((a,b) => b.createdAt.localeCompare(a.createdAt) || b.name.localeCompare(a.name));
}
export async function retainSeven(directory: string, kind: 'auto'|'safety') {
  const files = (await managedFiles(directory)).filter(f => f.kind === kind);
  for (const file of files.slice(7)) await unlink(join(directory, file.name));
}
