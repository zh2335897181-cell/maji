import { BrowserWindow, dialog, type IpcMainInvokeEvent } from 'electron';
import { writeFile } from 'node:fs/promises';
import { IPC } from '../../../src/lib/ipc';
import { MAP_LIMITS, readSources, remapGraph, sourceSnapshot, validateGraph, validateOptions, type MindMapRequest, type MindMapSource } from '../../../src/lib/mindmap';
import { toSafeFileName } from '../../../src/lib/text';
import * as maps from '../db/mindMaps';
import { getNote } from '../db/notes';
import { listCourses } from '../db/courses';
import { requireEntityId, requireNoteId } from './validate';
import type { AIService } from '../ai/service';

export function previewMapSources(value: unknown): MindMapSource[] {
  if (!Array.isArray(value) || !value.length || value.length > 12 || new Set(value).size !== value.length) throw new Error('请选取 1–12 篇不同的笔记');
  const courses = listCourses();
  return readSources(value.map(id => {
    const note = getNote(requireNoteId(id));
    if (!note) throw new Error('来源笔记已删除，请重新选择');
    return sourceSnapshot(note, courses.find(c => c.id === note.courseId)?.name ?? '未分类');
  }));
}
export function createMindMapHandlers(ai: AIService) {
  const requests = new Map<string, AbortController>();
  const key = (event: IpcMainInvokeEvent, id: unknown): string => `${event.sender.id}:${requireEntityId(id, '请求 ID')}`;
  return {
    [IPC.mindMapsList]: () => maps.listMindMaps(),
    [IPC.mindMapsSave]: (args: unknown[]) => maps.saveMindMap(args[0] as never, args[1] === undefined ? undefined : requireEntityId(args[1], '导图 ID'), args[2] as number | undefined),
    [IPC.mindMapsRemove]: (args: unknown[]) => maps.removeMindMap(requireEntityId(args[0], '导图 ID')),
    [IPC.mindMapsPreview]: (args: unknown[]) => previewMapSources(args[0]),
    [IPC.mindMapsGetView]: (args: unknown[]) => maps.getMindMapView(requireEntityId(args[0], '导图 ID')),
    [IPC.mindMapsSaveView]: (args: unknown[]) => maps.saveMindMapView(requireEntityId(args[0], '导图 ID'), args[1] as never),
    [IPC.mindMapsCancel]: (args: unknown[], event: IpcMainInvokeEvent) => { requests.get(key(event, args[0]))?.abort(); },
    [IPC.mindMapsGenerate]: async (args: unknown[], event: IpcMainInvokeEvent) => {
      const input = args[0] as MindMapRequest;
      if (!input || typeof input !== 'object') throw new Error('生成参数无效');
      const requestKey = key(event, input.requestId);
      if (requests.has(requestKey) || [...requests.keys()].some(k => k.startsWith(`${event.sender.id}:`))) throw new Error('请等待当前生成完成');
      const options = validateOptions(input.options), sources = previewMapSources(input.noteIds), confirmed = readSources(input.sources);
      if (JSON.stringify(sources) !== JSON.stringify(confirmed)) throw new Error('来源内容已变化，请重新确认发送范围');
      if (typeof input.title !== 'string' || input.title.length > 80) throw new Error('导图标题过长');
      if (input.operation && !['generate', 'expand', 'simplify'].includes(input.operation)) throw new Error('AI 操作无效');
      const graph = input.graph ? validateGraph(input.graph) : undefined;
      if (input.operation && input.operation !== 'generate' && (!graph || !graph.nodes.some(n => n.id === input.targetId))) throw new Error('请选择有效节点');
      const controller = new AbortController(); requests.set(requestKey, controller);
      const onDestroyed = () => controller.abort(); event.sender.once('destroyed', onDestroyed);
      try {
        const result = await ai.generateMindMap({ sources, options, title: input.title, operation: input.operation, graph, targetId: input.targetId }, controller.signal);
        if (controller.signal.aborted) throw new Error('AI 请求已取消');
        return { ...remapGraph(result), sources, options };
      } finally { requests.delete(requestKey); event.sender.removeListener('destroyed', onDestroyed); }
    },
    [IPC.mindMapsExport]: async (args: unknown[], event: IpcMainInvokeEvent) => {
      const [name, format, content] = args;
      if (typeof name !== 'string' || name.length > 300 || !['json', 'md', 'png'].includes(String(format)) || typeof content !== 'string') throw new Error('导出参数无效');
      if (content.length > (format === 'png' ? 24 * 1024 * 1024 : MAP_LIMITS.bytes)) throw new Error('导出内容过大，请缩小范围');
      if (format === 'png' && !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(content)) throw new Error('PNG 格式无效');
      const options = { title: '导出思维导图', defaultPath: toSafeFileName(name, String(format)), filters: [{ name: String(format).toUpperCase(), extensions: [String(format)] }] };
      const owner = BrowserWindow.fromWebContents(event.sender);
      const result = owner ? await dialog.showSaveDialog(owner, options) : await dialog.showSaveDialog(options);
      if (result.canceled || !result.filePath) return { saved: false };
      await writeFile(result.filePath, format === 'png' ? Buffer.from(content.split(',')[1]!, 'base64') : content);
      return { saved: true, path: result.filePath };
    },
  };
}
