import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { graph } from '../../test/mindmapFixture';
import { DEFAULT_MAP_OPTIONS, type MindMap, type MindMapApi } from '../../lib/mindmap';
import { useMindMapEditor } from './useMindMapEditor';
const map: MindMap = { ...graph, id: 'map_one', revision: 1, sources: [], options: DEFAULT_MAP_OPTIONS, createdAt: '', updatedAt: '' };
beforeEach(() => { localStorage.clear(); delete window.maji; });
it('does not replace pending edits with an old copy when opening the same map', async () => {
  const api = { save: vi.fn(async (d, id) => ({ ...d, id, revision: 2 })) } as unknown as MindMapApi;
  const { result } = renderHook(() => useMindMapEditor(api, vi.fn()));
  await act(() => result.current.open(map));
  act(() => result.current.edit({ ...map, title: '新标题' }));
  await act(() => result.current.open(map));
  expect(result.current.map?.title).toBe('新标题');
});
it('waits for preview A to finish saving before opening preview B', async () => {
  let resolve!: (value: MindMap) => void;
  const api = { save: vi.fn(() => new Promise<MindMap>(r => { resolve = r; })) } as unknown as MindMapApi;
  const { result } = renderHook(() => useMindMapEditor(api, vi.fn()));
  await act(() => result.current.open({ ...map, id: '', revision: 0 }, false));
  let saving!: Promise<boolean>; act(() => { saving = result.current.savePreview(); });
  let switching!: Promise<boolean>; act(() => { switching = result.current.open({ ...map, id: '', title: '导图 B', revision: 0 }, false); });
  expect(result.current.current.current?.title).toBe('函数');
  await act(async () => { resolve({ ...map, id: 'map_a' }); await saving; await switching; });
  expect(result.current.map?.id).toBe('');
  expect(result.current.map?.title).toBe('导图 B');
});
it('stores a newly generated preview for restart recovery', async () => {
  const { result } = renderHook(() => useMindMapEditor({} as MindMapApi, vi.fn()));
  await act(() => result.current.open({ ...map, id: '', revision: 0 }, false));
  expect(localStorage.getItem('maji:mindmap-recovery:preview')).toContain('函数');
});
it('keeps unsaved edits if persistence fails', async () => {
  const api = { save: vi.fn(async () => { throw new Error('磁盘写入失败'); }) } as unknown as MindMapApi;
  const { result } = renderHook(() => useMindMapEditor(api, vi.fn()));
  await act(() => result.current.open(map)); act(() => result.current.edit({ ...map, title: '保留我' }));
  await act(() => result.current.save());
  await waitFor(() => expect(result.current.error).toContain('磁盘写入失败'));
  expect(result.current.map?.title).toBe('保留我');
  expect(localStorage.getItem('maji:mindmap-recovery:map_one')).toContain('保留我');
});
it('cleans the preview recovery key after edits made during the first save', async () => {
  let finish!: (map: MindMap) => void;
  const save = vi.fn().mockImplementationOnce(() => new Promise<MindMap>(r => { finish = r; })).mockImplementation(async (draft, id, revision) => ({ ...draft, id, revision: revision + 1 }));
  const { result } = renderHook(() => useMindMapEditor({ save } as unknown as MindMapApi, vi.fn()));
  await act(() => result.current.open({ ...map, id: '', revision: 0 }, false));
  let saving!: Promise<boolean>; act(() => { saving = result.current.savePreview(); });
  act(() => result.current.edit({ ...map, title: '保存期间新增内容' }));
  await act(async () => { finish({ ...map, id: 'map_new', revision: 1 }); await saving; });
  expect(result.current.map?.title).toBe('保存期间新增内容');
  expect(localStorage.getItem('maji:mindmap-recovery:preview')).toBeNull();
});
