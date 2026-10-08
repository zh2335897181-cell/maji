import { descendants, mapMarkdown, type MindMap } from '../../lib/mindmap';
import type { LanguageId, NoteSummary, ReviewGenerationInput } from '../../lib/types';

export interface MindMapReviewPreset { title: string; sources: ReviewGenerationInput['sources']; language: LanguageId }
export function mindMapReviewPreset(map: MindMap, nodeId: string, notes: NoteSummary[]): MindMapReviewPreset {
  const root = map.nodes.find(n => n.id === nodeId); if (!root) throw new Error('导图节点已删除');
  const ids = descendants(map, nodeId);
  const branch = { ...map, rootId: nodeId, title: `${map.title} · ${root.title}`, nodes: map.nodes.filter(n => ids.has(n.id)).map(n => n.id === nodeId ? { ...n, parentId: null } : n), relations: map.relations.filter(r => ids.has(r.sourceId) && ids.has(r.targetId)) };
  const contentExcerpt = mapMarkdown(branch);
  if (contentExcerpt.length > 12000) throw new Error('选中分支内容过多，请选择更小的分支复习');
  const sourceIds = branch.nodes.flatMap(n => n.sourceRefs.map(r => r.noteId));
  const live = notes.find(n => sourceIds.includes(n.id));
  return { title: branch.title, language: live?.language ?? 'text', sources: [{ noteId: live?.id ?? null, noteTitle: branch.title, courseName: '思维导图', contentExcerpt, reviewItemIds: [] }] };
}
