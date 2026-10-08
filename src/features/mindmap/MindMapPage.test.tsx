import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MindMapPage } from './MindMapPage';
import { graph } from '../../test/mindmapFixture';
import { DEFAULT_MAP_OPTIONS } from '../../lib/mindmap';
const fixture = { ...graph, id: 'map_one', revision: 1, options: DEFAULT_MAP_OPTIONS, sources: [], createdAt: 'today', updatedAt: 'today' };
vi.mock('../../app/LibraryProvider', () => ({ useLibrary: () => ({ notes: [], courses: [], loadNote: vi.fn() }) }));
const api = { list: vi.fn(), save: vi.fn(), getView: vi.fn(async () => null), saveView: vi.fn(async () => {}), remove: vi.fn(), preview: vi.fn(), generate: vi.fn(), cancel: vi.fn(), exportFile: vi.fn() };
describe('mind map workbench', () => {
  beforeEach(() => { vi.clearAllMocks(); api.list.mockResolvedValue([]); api.save.mockImplementation(async (draft) => ({ ...fixture, ...draft })); window.maji = { mindMaps: api } as never; });
  it('shows the empty state and scrollable generation configuration', async () => {
    render(<MemoryRouter><MindMapPage /></MemoryRouter>);
    await screen.findByText('把零散笔记，整理成清晰的知识结构');
    fireEvent.click(screen.getAllByText('从笔记生成')[0]!);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('详细程度')).toBeInTheDocument();
  });
  it('loads saved maps, edits a node and saves only after editing', async () => {
    api.list.mockResolvedValue([fixture]);
    render(<MemoryRouter><MindMapPage /></MemoryRouter>);
    const node = await screen.findByRole('button', { name: '节点 参数' });
    fireEvent.click(node);
    fireEvent.change(screen.getByLabelText('节点标题'), { target: { value: '调用参数' } });
    await waitFor(() => expect(api.save).toHaveBeenCalled(), { timeout: 2000 });
    expect(api.save.mock.calls[0]?.[0].nodes.find((n: { id: string }) => n.id === 'a').title).toBe('调用参数');
  });
});
