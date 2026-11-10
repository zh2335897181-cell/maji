import { mkdtemp, open, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { readProjectExcerpt } from './projectAttachments';

vi.mock('electron', () => ({ BrowserWindow: {}, dialog: {} }));

it('reads a UTF-8 excerpt across a page boundary without loading the entire file', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'maji-project-'));
  try {
    const absolutePath = join(await realpath(directory), 'large.ts');
    const offset = 128 * 1024 * 1024;
    const prefix = 'a'.repeat(4095);
    const contents = Buffer.from(prefix + '中文');
    const handle = await open(absolutePath, 'w');
    try {
      await handle.write(contents, 0, contents.length, offset);
    } finally {
      await handle.close();
    }
    const file = { id: 'file', path: 'large.ts', size: offset + contents.length, absolutePath };
    const first = await readProjectExcerpt(file, offset);
    expect(first.text).toBe(prefix);
    expect(first.nextOffset).toBe(offset + 4095);
    const second = await readProjectExcerpt(file, first.nextOffset!);
    expect(second).toMatchObject({ text: '中文', nextOffset: null });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
