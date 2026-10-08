import { describe, expect, it, vi } from 'vitest';
import { AIClient } from './client';
import { graph } from '../../../src/test/mindmapFixture';
import { DEFAULT_MAP_OPTIONS } from '../../../src/lib/mindmap';

const sources = [{ noteId: 'note1', noteTitle: '参数', courseName: 'Python', noteUpdatedAt: 'today', contentExcerpt: '函数支持位置参数。' }];
const settings = { baseUrl: 'https://example.com/v1', model: 'test' };
describe('structured mind map generation', () => {
  it('uses isolated material and validates citations', async () => {
    const fetcher = vi.fn(async (_url: unknown, _options?: RequestInit) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(graph) } }] })));
    const client = new AIClient({ fetch: fetcher });
    const result = await client.generateMindMap(settings, 'key', { sources, options: { ...DEFAULT_MAP_OPTIONS, allowSupplement: true }, title: '函数' });
    expect(result.nodes).toHaveLength(3);
    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(body.messages[0].content).toContain('SOURCE_DATA');
    expect(body.messages[1].content).toContain('位置参数');
  });
  it('rejects fabricated citations and cancels the network request', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(graph) } }] })));
    const client = new AIClient({ fetch: fetcher });
    await expect(client.generateMindMap(settings, 'key', { sources: [{ ...sources[0], contentExcerpt: '不包含引用' }], options: { ...DEFAULT_MAP_OPTIONS, allowSupplement: true }, title: '函数' })).rejects.toThrow('引用');
    const controller = new AbortController(); controller.abort();
    await expect(client.generateMindMap(settings, 'key', { sources, options: DEFAULT_MAP_OPTIONS, title: '函数' }, controller.signal)).rejects.toThrow('取消');
  });
});
