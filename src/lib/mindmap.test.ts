import { describe, expect, it } from 'vitest';
import { validateGraph, validateSources, moveNode, deleteBranch, importMap, mapMarkdown, layoutGraph } from './mindmap';
import { graph } from '../test/mindmapFixture';
describe('mind map safety and editing', () => {
  it('accepts a connected tree and rejects cycles, duplicate IDs, and dangling relationships', () => {
    expect(validateGraph(graph).nodes).toHaveLength(3);
    expect(() => validateGraph({ ...graph, nodes: [...graph.nodes, graph.nodes[1]] })).toThrow();
    expect(() => validateGraph({ ...graph, nodes: graph.nodes.map(n => n.id === 'a' ? { ...n, parentId: 'b' } : n) })).toThrow();
    expect(() => validateGraph({ ...graph, relations: [{ sourceId: 'a', targetId: 'missing', label: 'x' }] })).toThrow();
  });
  it('checks AI citations against the actual selected text', () => {
    const sources = [{ noteId: 'note1', noteTitle: '参数', courseName: 'Python', noteUpdatedAt: '2026-10-08', contentExcerpt: '函数支持位置参数。' }];
    expect(() => validateSources(graph, sources, true)).not.toThrow();
    expect(() => validateSources(graph, [{ ...sources[0], contentExcerpt: '没有引用' }], true)).toThrow();
    expect(() => validateSources(graph, sources, false)).toThrow();
  });
  it('prevents moving a node into its descendant and removes edges when deleting a branch', () => {
    expect(() => moveNode(graph, 'a', 'b')).toThrow();
    expect(() => deleteBranch(graph, 'root')).toThrow();
    const next = deleteBranch(graph, 'a');
    expect(next.nodes.map(n => n.id)).toEqual(['root']);
    expect(next.relations).toEqual([]);
  });
  it('imports as a new map with rewritten IDs and rejects unsupported versions', () => {
    const imported = importMap(JSON.stringify({ formatVersion: 1, graph, sources: [], options: {} }));
    expect(imported.rootId).not.toBe('root');
    expect(imported.nodes[1]?.parentId).toBe(imported.rootId);
    expect(imported.relations[0]?.sourceId).toBe(imported.nodes[1]?.id);
    expect(() => importMap('{"formatVersion":99}')).toThrow();
  });
  it('lays out collapsed subtrees and exports code and sources as markdown', () => {
    expect(layoutGraph(graph, ['a']).positions.has('b')).toBe(false);
    const md = mapMarkdown(graph);
    expect(md).toContain('```python\nprint(1)');
    expect(md).toContain('位置参数');
    expect(md).toContain('AI 补充');
  });
});
