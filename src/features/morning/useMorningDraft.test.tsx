import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useMorningDraft } from './useMorningDraft';
import { EMPTY_MORNING_CONTENT, type MorningApi, type MorningNote } from '../../lib/morningNotes';
const note: MorningNote = { id: 'morning_one', date: '2026-10-09', title: '概念题', contentJson: EMPTY_MORNING_CONTENT, revision: 1, createdAt: '', updatedAt: '' };
beforeEach(() => { localStorage.clear(); window.maji = undefined; });
it('preserves unsaved edits when saving fails and prevents switching records', async () => {
  const update = vi.fn().mockRejectedValue(new Error('磁盘写入失败'));
  const api = { update } as unknown as MorningApi;
  const { result } = renderHook(() => useMorningDraft(api, vi.fn(), 10000));
  await act(async () => { await result.current.open(note); });
  act(() => result.current.edit({ title: '保留我的修改' }));
  await act(async () => { expect(await result.current.open({ ...note, id: 'morning_two' })).toBe(false); });
  expect(result.current.note?.id).toBe(note.id);
  expect(result.current.note?.title).toBe('保留我的修改');
  expect(result.current.error).toBe('磁盘写入失败');
  expect(localStorage.getItem(`maji:morning-draft:${note.id}`)).toContain('保留我的修改');
});
it('serializes edits during save and persists the latest revision without overwriting newer input', async () => {
  let resolve!: (saved: MorningNote) => void;
  const update = vi.fn().mockImplementationOnce(() => new Promise<MorningNote>(r => { resolve = r; }))
    .mockImplementation(async (_id, input, revision) => ({ ...note, ...input, revision: revision + 1 }));
  const { result } = renderHook(() => useMorningDraft({ update } as unknown as MorningApi, vi.fn(), 10000));
  await act(async () => { await result.current.open(note); });
  act(() => result.current.edit({ title: '第一次' }));
  let flight!: Promise<boolean>;
  act(() => { flight = result.current.save(); });
  act(() => result.current.edit({ title: '第二次' }));
  await act(async () => { resolve({ ...note, title: '第一次', revision: 2 }); await flight; });
  expect(result.current.note?.title).toBe('第二次');
  expect(result.current.note?.revision).toBe(3);
  expect(update.mock.calls[1][2]).toBe(2);
  expect(localStorage.getItem(`maji:morning-draft:${note.id}`)).toBeNull();
});
it('restores the pending draft on reopen and keeps same-record edits', async () => {
  localStorage.setItem(`maji:morning-draft:${note.id}`, JSON.stringify({ ...note, title: '恢复的内容' }));
  const update = vi.fn().mockImplementation(async (_id, input, revision) => ({ ...note, ...input, revision: revision + 1 }));
  const { result } = renderHook(() => useMorningDraft({ update } as unknown as MorningApi, vi.fn(), 10000));
  await act(async () => { await result.current.open(note); });
  expect(result.current.note?.title).toBe('恢复的内容');
  act(() => result.current.edit({ title: '继续修改' }));
  await act(async () => { await result.current.open(note); });
  expect(result.current.note?.title).toBe('继续修改');
});
it('restores incomplete metadata too, so a failed save cannot discard the transcribed body', async () => {
  const body = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"重要答案"}]}]}';
  localStorage.setItem(`maji:morning-draft:${note.id}`, JSON.stringify({ ...note, title: '', date: '', contentJson: body }));
  const { result } = renderHook(() => useMorningDraft({ update: vi.fn() } as unknown as MorningApi, vi.fn(), 10000));
  await act(async () => { await result.current.open(note); });
  expect(result.current.note?.title).toBe('');
  expect(result.current.initialContent).toContain('重要答案');
});
