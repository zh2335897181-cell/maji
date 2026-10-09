import { beforeEach, expect, it } from 'vitest';
import { morningApi } from './repository';
beforeEach(() => { window.maji = undefined; localStorage.clear(); });
it('persists multiple entries on the same date and rejects stale saves', async () => {
  const api = morningApi(), input = { date: '2026-10-09', title: '第一份', contentJson: '{"type":"doc","content":[{"type":"paragraph"}]}' };
  const first = await api.create(input), second = await api.create({ ...input, title: '第二份' });
  expect((await api.list()).map(n => n.id)).toContain(second.id);
  expect(await api.list()).toHaveLength(2);
  const saved = await api.update(first.id, { ...input, title: '修改后' }, first.revision);
  expect(saved.revision).toBe(2);
  await expect(api.update(first.id, input, first.revision)).rejects.toThrow('修改');
  expect((await morningApi().list()).find(n => n.id === first.id)?.title).toBe('修改后');
});
