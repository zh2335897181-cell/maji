import { getRepository } from '../../lib/dataSource';
import { createId, toSafeFileName } from '../../lib/text';
import { readSources, sourceSnapshot, validateDraft, validateView, type MindMap, type MindMapApi } from '../../lib/mindmap';

const STORAGE = 'maji:mindmaps:v1';
function read(): MindMap[] {
  const raw = JSON.parse(localStorage.getItem(STORAGE) ?? '[]') as MindMap[];
  if (!Array.isArray(raw)) throw new Error('本地导图数据无效');
  return raw.map(map => ({ ...map, ...validateDraft(map) }));
}
function download(name: string, content: Blob): void {
  const url = URL.createObjectURL(content), a = document.createElement('a'); a.href = url; a.download = name; a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const browser: MindMapApi = {
  list: async () => read().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  save: async (value, id, expectedRevision) => {
    const draft = validateDraft(value), maps = read(), previous = maps.find(m => m.id === id), now = new Date().toISOString();
    if (id && (!previous || previous.revision !== expectedRevision)) throw new Error('导图已被修改或删除，请另存草稿');
    const next: MindMap = { ...draft, id: id ?? createId('map'), revision: (previous?.revision ?? 0) + 1, createdAt: previous?.createdAt ?? now, updatedAt: now };
    localStorage.setItem(STORAGE, JSON.stringify([next, ...maps.filter(m => m.id !== next.id)])); return next;
  },
  remove: async id => { localStorage.setItem(STORAGE, JSON.stringify(read().filter(m => m.id !== id))); localStorage.removeItem(`${STORAGE}:${id}`); },
  preview: async ids => {
    if (!ids.length || ids.length > 12) throw new Error('请选取 1–12 篇笔记');
    const repo = getRepository(), courses = await repo.listCourses();
    return readSources(await Promise.all(ids.map(async id => {
      const note = await repo.getNote(id); if (!note) throw new Error('来源笔记已删除');
      return sourceSnapshot(note, courses.find(c => c.id === note.courseId)?.name ?? '未分类');
    })));
  },
  generate: async () => { throw new Error('AI 生成需要桌面版及已配置的 AI 服务，浏览器中可以导入和编辑导图'); },
  cancel: async () => {},
  getView: async id => { const raw = localStorage.getItem(`${STORAGE}:${id}`); return raw ? validateView(JSON.parse(raw)) : null; },
  saveView: async (id, view) => { localStorage.setItem(`${STORAGE}:${id}`, JSON.stringify(validateView(view))); },
  exportFile: async (name, format, content) => {
    const blob = format === 'png' ? new Blob([Uint8Array.from(atob(content.split(',')[1]!), char => char.charCodeAt(0))], { type: 'image/png' }) : new Blob([content], { type: format === 'json' ? 'application/json' : 'text/markdown;charset=utf-8' });
    download(toSafeFileName(name, format), blob); return { saved: true };
  },
};
export function mindMapApi(): MindMapApi {
  if (window.maji && !window.maji.mindMaps) throw new Error('请重启桌面应用以加载思维导图接口');
  return window.maji?.mindMaps ?? browser;
}
