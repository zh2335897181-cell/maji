import { createId } from './text';
import { docToMarkdown, type Doc } from './noteDoc';
import type { Note } from './types';

export const MAP_LIMITS = { nodes: 120, depth: 6, sources: 12, sourceUnits: 12000, totalUnits: 48000, bytes: 2 * 1024 * 1024 };
export const NODE_KINDS = ['concept', 'syntax', 'example', 'pitfall', 'comparison', 'prerequisite', 'scenario'] as const;
export interface MindMapSource { noteId: string; noteTitle: string; courseName: string; noteUpdatedAt: string; contentExcerpt: string }
export interface MindMapNode {
  id: string; parentId: string | null; title: string; description: string;
  kind: typeof NODE_KINDS[number]; sourceRefs: { noteId: string; quote: string }[];
  isSupplement: boolean; codeExamples: { language: string; code: string }[];
  origin?: 'ai' | 'user';
}
export interface MindMapGraph { title: string; rootId: string; nodes: MindMapNode[]; relations: { sourceId: string; targetId: string; label: string }[] }
export interface MindMapOptions { depth: 'quick' | 'standard' | 'deep'; organization: 'knowledge' | 'route' | 'review'; includeCode: boolean; highlightPitfalls: boolean; allowSupplement: boolean }
export const DEFAULT_MAP_OPTIONS: MindMapOptions = { depth: 'standard', organization: 'knowledge', includeCode: true, highlightPitfalls: true, allowSupplement: false };
export interface MindMap extends MindMapGraph { id: string; sources: MindMapSource[]; options: MindMapOptions; revision: number; createdAt: string; updatedAt: string }
export interface MindMapView { collapsedIds: string[]; x: number; y: number; zoom: number }
export interface MindMapRequest { requestId: string; noteIds: string[]; sources: MindMapSource[]; options: MindMapOptions; title: string; operation?: 'generate' | 'expand' | 'simplify'; graph?: MindMapGraph; targetId?: string }
export interface MindMapDraft extends MindMapGraph { sources: MindMapSource[]; options: MindMapOptions }
export interface MindMapApi {
  list(): Promise<MindMap[]>; save(draft: MindMapDraft, id?: string, expectedRevision?: number): Promise<MindMap>;
  remove(id: string): Promise<void>; preview(noteIds: string[]): Promise<MindMapSource[]>;
  generate(input: MindMapRequest): Promise<MindMapDraft>; cancel(requestId: string): Promise<void>;
  getView(id: string): Promise<MindMapView | null>; saveView(id: string, view: MindMapView): Promise<void>;
  exportFile(name: string, format: 'json' | 'md' | 'png', content: string): Promise<{ saved: boolean; path?: string }>;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('导图数据格式无效');
  return value as Record<string, unknown>;
}
function string(value: unknown, max: number, empty = false): string {
  if (typeof value !== 'string' || value.length > max || (!empty && !value.trim())) throw new Error('导图字段为空或过长');
  return value;
}
export function validateGraph(value: unknown): MindMapGraph {
  if (JSON.stringify(value).length > MAP_LIMITS.bytes) throw new Error('导图数据过大');
  const input = object(value);
  const title = string(input.title, 80), rootId = string(input.rootId, 120);
  if (!Array.isArray(input.nodes) || !input.nodes.length || input.nodes.length > MAP_LIMITS.nodes) throw new Error('导图节点数量无效');
  const nodes: MindMapNode[] = input.nodes.map((raw: unknown) => {
    const n = object(raw);
    if (!(NODE_KINDS as readonly unknown[]).includes(n.kind) || typeof n.isSupplement !== 'boolean') throw new Error('节点类型无效');
    if (!Array.isArray(n.sourceRefs) || n.sourceRefs.length > 12 || !Array.isArray(n.codeExamples) || n.codeExamples.length > 4) throw new Error('节点引用或代码格式无效');
    return {
      id: string(n.id, 120), parentId: n.parentId === null ? null : string(n.parentId, 120), title: string(n.title, 80),
      description: string(n.description, 2000, true), kind: n.kind as MindMapNode['kind'], isSupplement: n.isSupplement,
      sourceRefs: n.sourceRefs.map(r => { const ref = object(r); return { noteId: string(ref.noteId, 120), quote: string(ref.quote, 2000) }; }),
      codeExamples: n.codeExamples.map(r => { const code = object(r); return { language: string(code.language, 40), code: string(code.code, 8000) }; }),
      origin: n.origin === 'user' ? 'user' : 'ai',
    };
  });
  const byId = new Map(nodes.map(n => [n.id, n]));
  if (byId.size !== nodes.length || nodes.filter(n => n.parentId === null).length !== 1 || byId.get(rootId)?.parentId !== null) throw new Error('根节点或节点 ID 无效');
  for (const node of nodes) {
    let cursor: MindMapNode | undefined = node; const visited = new Set<string>();
    while (cursor) {
      if (visited.has(cursor.id) || visited.size >= MAP_LIMITS.depth) throw new Error('导图存在循环或层级过深');
      visited.add(cursor.id);
      if (cursor.parentId === null) break;
      cursor = byId.get(cursor.parentId);
      if (!cursor) throw new Error('节点父级不存在');
    }
  }
  if (!Array.isArray(input.relations) || input.relations.length > 180) throw new Error('关联数量无效');
  const relations = input.relations.map((raw: unknown) => {
    const r = object(raw); const sourceId = string(r.sourceId, 120), targetId = string(r.targetId, 120);
    if (!byId.has(sourceId) || !byId.has(targetId) || sourceId === targetId) throw new Error('知识关联目标无效');
    return { sourceId, targetId, label: string(r.label, 80) };
  });
  return { title, rootId, nodes, relations };
}
export function validateOptions(value: unknown): MindMapOptions {
  const v = object(value);
  if (!['quick', 'standard', 'deep'].includes(v.depth as string) || !['knowledge', 'route', 'review'].includes(v.organization as string)
    || ['includeCode', 'highlightPitfalls', 'allowSupplement'].some(k => typeof v[k] !== 'boolean')) throw new Error('生成选项无效');
  return { depth: v.depth as MindMapOptions['depth'], organization: v.organization as MindMapOptions['organization'], includeCode: v.includeCode as boolean, highlightPitfalls: v.highlightPitfalls as boolean, allowSupplement: v.allowSupplement as boolean };
}
export function readSources(value: unknown): MindMapSource[] {
  if (!Array.isArray(value) || value.length > 12) throw new Error('来源笔记数量无效');
  const sources = value.map(raw => { const s = object(raw); return { noteId: string(s.noteId, 120), noteTitle: string(s.noteTitle, 300), courseName: string(s.courseName, 300), noteUpdatedAt: string(s.noteUpdatedAt, 100), contentExcerpt: string(s.contentExcerpt, MAP_LIMITS.sourceUnits) }; });
  if (sources.reduce((sum, s) => sum + s.contentExcerpt.length, 0) > MAP_LIMITS.totalUnits || new Set(sources.map(s => s.noteId)).size !== sources.length) throw new Error('来源内容过长或重复');
  return sources;
}
export function validateDraft(value: unknown): MindMapDraft {
  const v = object(value); return { ...validateGraph(v), sources: readSources(v.sources), options: validateOptions(v.options) };
}
export function validateSources(graph: MindMapGraph, sources: MindMapSource[], allowSupplement: boolean): void {
  for (const node of graph.nodes) {
    if (node.isSupplement && !allowSupplement) throw new Error('AI 返回了未授权的补充知识');
    if (!node.isSupplement && node.id !== graph.rootId && !node.sourceRefs.length) throw new Error('AI 节点缺少来源引用');
    for (const ref of node.sourceRefs) {
      const source = sources.find(s => s.noteId === ref.noteId);
      if (!source || !source.contentExcerpt.includes(ref.quote)) throw new Error('AI 引用了未发送的笔记内容');
    }
  }
}
export function descendants(graph: MindMapGraph, id: string): Set<string> {
  const ids = new Set([id]); let previous = 0;
  while (previous !== ids.size) { previous = ids.size; graph.nodes.forEach(n => { if (n.parentId && ids.has(n.parentId)) ids.add(n.id); }); }
  return ids;
}
export function deleteBranch(graph: MindMapGraph, id: string): MindMapGraph {
  if (id === graph.rootId) throw new Error('根节点不能删除');
  const ids = descendants(graph, id);
  return { ...graph, nodes: graph.nodes.filter(n => !ids.has(n.id)), relations: graph.relations.filter(r => !ids.has(r.sourceId) && !ids.has(r.targetId)) };
}
export function moveNode(graph: MindMapGraph, id: string, parentId: string): MindMapGraph {
  if (id === graph.rootId || descendants(graph, id).has(parentId)) throw new Error('不能移动到自身或后代');
  return validateGraph({ ...graph, nodes: graph.nodes.map(n => n.id === id ? { ...n, parentId } : n) });
}
export function remapGraph(graph: MindMapGraph): MindMapGraph {
  const ids = new Map(graph.nodes.map(n => [n.id, createId('node')]));
  return { ...graph, rootId: ids.get(graph.rootId)!, nodes: graph.nodes.map(n => ({ ...n, id: ids.get(n.id)!, parentId: n.parentId === null ? null : ids.get(n.parentId)! })), relations: graph.relations.map(r => ({ ...r, sourceId: ids.get(r.sourceId)!, targetId: ids.get(r.targetId)! })) };
}
export function importMap(text: string): MindMapDraft {
  if (text.length > MAP_LIMITS.bytes) throw new Error('导入文件过大');
  const v = object(JSON.parse(text)); if (v.formatVersion !== 1) throw new Error('不支持此导图备份版本');
  const graph = remapGraph(validateGraph(v.graph));
  return { ...graph, sources: readSources(v.sources), options: Object.keys(object(v.options)).length ? validateOptions(v.options) : { ...DEFAULT_MAP_OPTIONS } };
}
export function backupMap(map: MindMapDraft): string { return JSON.stringify({ formatVersion: 1, graph: validateGraph(map), sources: map.sources, options: map.options }, null, 2); }
export function mapMarkdown(graph: MindMapGraph): string {
  const lines = [`# ${graph.title}`, ''];
  const visit = (id: string, depth: number): void => {
    const n = graph.nodes.find(n => n.id === id)!;
    lines.push(`${'#'.repeat(Math.min(6, depth + 1))} ${n.title}${n.isSupplement ? '（AI 补充）' : ''}`, '', n.description, '');
    for (const c of n.codeExamples) { const fence = '`'.repeat(Math.max(3, ...(c.code.match(/`+/g) ?? []).map(s => s.length + 1))); lines.push(`${fence}${c.language.replace(/[^a-zA-Z0-9+#_-]/g, '')}`, c.code, fence, ''); }
    n.sourceRefs.forEach(r => lines.push(`来源 ${r.noteId}：${r.quote}`, ''));
    graph.nodes.filter(child => child.parentId === id).forEach(child => visit(child.id, depth + 1));
  };
  visit(graph.rootId, 1);
  if (graph.relations.length) lines.push('## 知识关联', '', ...graph.relations.map(r => `- ${graph.nodes.find(n => n.id === r.sourceId)?.title} → ${graph.nodes.find(n => n.id === r.targetId)?.title}：${r.label}`));
  return lines.join('\n');
}
export function layoutGraph(graph: MindMapGraph, collapsed: string[] = []): { positions: Map<string, { x: number; y: number }>; width: number; height: number } {
  const hidden = new Set(collapsed); const positions = new Map<string, { x: number; y: number }>();
  const children = (id: string): MindMapNode[] => hidden.has(id) ? [] : graph.nodes.filter(n => n.parentId === id);
  let y = 0, maxX = 0;
  const visit = (id: string, depth: number): number => {
    const kids = children(id); const childYs = kids.map(n => visit(n.id, depth + 1));
    const center = childYs.length ? (childYs[0]! + childYs[childYs.length - 1]!) / 2 : (y++ * 85 + 55);
    const x = depth * 225 + 40; maxX = Math.max(maxX, x);
    positions.set(id, { x, y: center }); return center;
  };
  visit(graph.rootId, 0); return { positions, width: maxX + 240, height: Math.max(180, y * 85 + 60) };
}
export function validateView(value: unknown): MindMapView {
  const v = object(value);
  if (!Array.isArray(v.collapsedIds) || v.collapsedIds.length > 120 || v.collapsedIds.some(id => typeof id !== 'string' || id.length > 120)
    || ![v.x, v.y, v.zoom].every(n => typeof n === 'number' && Number.isFinite(n)) || (v.zoom as number) < .2 || (v.zoom as number) > 2.5) throw new Error('画布状态无效');
  return { collapsedIds: v.collapsedIds as string[], x: v.x as number, y: v.y as number, zoom: v.zoom as number };
}
export function sourceSnapshot(note: Note, courseName: string): MindMapSource {
  const contentExcerpt = docToMarkdown(JSON.parse(note.contentJson) as Doc).trim();
  if (!contentExcerpt) throw new Error(`「${note.title}」没有正文，请取消选择此笔记`);
  if (contentExcerpt.length > MAP_LIMITS.sourceUnits) throw new Error(`「${note.title}」超过 ${MAP_LIMITS.sourceUnits} 字符，请拆分笔记或缩小范围`);
  return { noteId: note.id, noteTitle: note.title, courseName, noteUpdatedAt: note.updatedAt, contentExcerpt };
}
