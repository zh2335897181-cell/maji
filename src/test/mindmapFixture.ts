import type { MindMapGraph } from '../lib/mindmap';
export const graph: MindMapGraph = {
  title: '函数', rootId: 'root',
  nodes: [
    { id: 'root', parentId: null, title: '函数', description: '', kind: 'concept', sourceRefs: [], isSupplement: false, codeExamples: [] },
    { id: 'a', parentId: 'root', title: '参数', description: '位置参数', kind: 'syntax', sourceRefs: [{ noteId: 'note1', quote: '位置参数' }], isSupplement: false, codeExamples: [] },
    { id: 'b', parentId: 'a', title: '例子', description: '', kind: 'example', sourceRefs: [], isSupplement: true, codeExamples: [{ language: 'python', code: 'print(1)' }] },
  ], relations: [{ sourceId: 'a', targetId: 'b', label: '示例' }],
};
