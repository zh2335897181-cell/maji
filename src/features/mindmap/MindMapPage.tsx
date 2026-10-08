import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { GitBranch, Plus, X, PanelLeft, PanelRight, Save, Download, Upload, Sparkles } from 'lucide-react';
import { Button, IconButton } from '../../components/ui/Button';
import { ConfirmDialog, Modal } from '../../components/ui/Modal';
import { useLibrary } from '../../app/LibraryProvider';
import { ROUTES } from '../../app/routes';
import { createId } from '../../lib/text';
import { backupMap, deleteBranch, descendants, importMap, mapMarkdown, moveNode, readSources, validateDraft, validateGraph, type MindMap, type MindMapDraft, type MindMapView } from '../../lib/mindmap';
import { mindMapApi } from './repository';
import { MindMapSetup } from './MindMapSetup';
import { DEFAULT_VIEW, MindMapCanvas } from './MindMapCanvas';
import { MindMapDetails } from './MindMapDetails';
import { useMindMapEditor } from './useMindMapEditor';
import { mapPNG } from './export';
import styles from './mindmap.module.css';

type AIOperation = 'expand' | 'simplify' | 'generate';
export function MindMapPage() {
  const api = useMemo(() => mindMapApi(), []), navigate = useNavigate(), { mapId } = useParams(), [params] = useSearchParams();
  const { notes } = useLibrary();
  const [maps, setMaps] = useState<MindMap[]>([]), [loading, setLoading] = useState(true), [pageError, setPageError] = useState('');
  const [setup, setSetup] = useState(false), [search, setSearch] = useState(''), [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<MindMapView>({ ...DEFAULT_VIEW }), [leftOpen, setLeftOpen] = useState<boolean | null>(null), [rightOpen, setRightOpen] = useState<boolean | null>(null);
  const [help, setHelp] = useState(false), [exportOpen, setExportOpen] = useState(false), [exportFull, setExportFull] = useState(true), [exportBusy, setExportBusy] = useState(false);
  const [deletion, setDeletion] = useState<{ type: 'map' | 'node'; id: string; count: number } | null>(null);
  const [ai, setAI] = useState<{ operation: AIOperation; sources: MindMapDraft['sources']; target: string; baseId: string; stamp: number; result?: MindMapDraft } | null>(null);
  const [aiBusy, setAIBusy] = useState(false), [message, setMessage] = useState('');
  const container = useRef<HTMLElement>(null);
  const request = useRef(''), file = useRef<HTMLInputElement>(null), loaded = useRef(false), viewTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined), liveView = useRef(view);
  const editor = useMindMapEditor(api, saved => setMaps(items => [saved, ...items.filter(m => m.id !== saved.id)]));
  const { map } = editor;
  const open = async (next: MindMap) => {
    if (map && !map.id && !window.confirm('当前为尚未保存的预览，确认切换？草稿将保留在本机。')) return;
    if (!(await editor.open(next))) return;
    setSelected(editor.current.current?.rootId ?? next.rootId); setLeftOpen(v => v === true && (container.current?.clientWidth ?? 1200) < 1100 ? false : v); setView({ ...DEFAULT_VIEW });
    try { const state = await api.getView(next.id); if (state && editor.current.current?.id === next.id) setView(state); }
    catch { setPageError('画布位置恢复失败，已使用默认位置'); }
  };
  useEffect(() => {
    let active = true;
    void api.list().then(items => {
      if (!active) return; setMaps(items);
      const note = params.get('note');
      if (note && notes.some(n => n.id === note)) setSetup(true);
      if (!loaded.current) {
        loaded.current = true;
        const raw = localStorage.getItem('maji:mindmap-recovery:preview');
        if (raw && !note && !mapId) {
          try { const recovered = validateDraft(JSON.parse(raw)); void editor.open({ ...recovered, id: '', revision: 0, createdAt: '', updatedAt: '' }, false).then(() => { setSelected(recovered.rootId); setMessage('已恢复尚未保存的导图预览，请检查后保存'); }); }
          catch { setPageError('未保存预览无法恢复，请导入备份或重新生成'); }
        } else { const first = items.find(m => m.id === mapId) ?? items[0]; if (first && !note) void open(first); }
      }
    }).catch(e => { if (active) setPageError(e instanceof Error ? e.message : '加载导图失败'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api]);
  useEffect(() => {
    liveView.current = view; clearTimeout(viewTimer.current);
    const id = map?.id;
    if (id) viewTimer.current = setTimeout(() => { void api.saveView(id, view).catch(() => setPageError('画布状态保存失败')); }, 700);
    return () => { clearTimeout(viewTimer.current); };
  }, [api, map?.id, view]);
  useEffect(() => () => { if (request.current) void api.cancel(request.current).catch(() => {}); const id = editor.current.current?.id; if (id) void api.saveView(id, liveView.current).catch(() => {}); }, [api]);
  const onGenerated = async (draft: MindMapDraft) => {
    if (editor.current.current && !editor.current.current.id && !window.confirm('替换尚未保存的导图预览？请先保存或导出需要保留的内容。')) return false;
    const preview: MindMap = { ...draft, id: '', revision: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    if (await editor.open(preview, false)) { setSetup(false); setSelected(preview.rootId); setView({ ...DEFAULT_VIEW }); setMessage('生成完成，请检查导图后点击保存'); return true; } return false;
  };
  const discardPreview = async () => {
    if (!window.confirm('放弃尚未保存的导图预览？')) return;
    localStorage.removeItem('maji:mindmap-recovery:preview'); editor.clear(); setSelected(null); setMessage('已放弃生成预览');
    if (maps[0]) { await editor.open(maps[0]); setSelected(maps[0].rootId); }
  };
  const node = map?.nodes.find(n => n.id === selected) ?? null;
  const focusTitle = () => { setRightOpen(true); window.setTimeout(() => document.getElementById('mindmap-node-title')?.focus(), 0); };
  const add = (sibling: boolean) => {
    if (!map || !node) return;
    const id = createId('node'), parentId = sibling && node.parentId ? node.parentId : node.id;
    try { const next = validateGraph({ ...map, nodes: [...map.nodes, { id, parentId, title: '新知识点', description: '', kind: 'concept', sourceRefs: [], isSupplement: false, codeExamples: [], origin: 'user' }] }); editor.edit({ ...map, ...next }); setSelected(id); setView(v => ({ ...v, collapsedIds: v.collapsedIds.filter(n => n !== parentId) })); focusTitle(); } catch (e) { editor.setError(e instanceof Error ? e.message : '添加失败'); }
  };
  const deleteNode = () => { if (map && node && node.id !== map.rootId) setDeletion({ type: 'node', id: node.id, count: descendants(map, node.id).size }); };
  const remove = async () => {
    if (!deletion) return;
    try {
      if (deletion.type === 'node' && map) { editor.edit({ ...map, ...deleteBranch(map, deletion.id) }); setSelected(map.rootId); }
      else { if (map?.id === deletion.id && !(await editor.save())) return; await api.remove(deletion.id); setMaps(items => items.filter(m => m.id !== deletion.id)); localStorage.removeItem(`maji:mindmap-recovery:${deletion.id}`); if (map?.id === deletion.id) { editor.clear(); const next = maps.find(m => m.id !== deletion.id); if (next) await open(next); else setSelected(null); } }
      setDeletion(null);
    } catch (e) { editor.setError(e instanceof Error ? e.message : '删除失败'); }
  };
  const loadAI = async (operation: AIOperation) => {
    if (!map || (operation !== 'generate' && !node)) return;
    setPageError('');
    try {
      if (!window.maji?.ai || !(await window.maji.ai.getSettings()).configured) { window.dispatchEvent(new Event('maji:open-ai-settings')); throw new Error('请先配置桌面版 AI 服务'); }
      const sources = await api.preview(map.sources.map(s => s.noteId));
      setAI({ operation, sources, target: node?.id ?? map.rootId, baseId: map.id, stamp: editor.version.current });
    } catch (e) { setPageError(e instanceof Error ? e.message : '读取来源失败'); }
  };
  const cancelAI = () => { const id = request.current; request.current = ''; if (id) void api.cancel(id).catch(() => {}); setAI(null); setAIBusy(false); };
  const generateAI = async () => {
    if (!ai || !map) return;
    const id = createId('request'); request.current = id; setAIBusy(true); setPageError('');
    try {
      const result = await api.generate({ requestId: id, noteIds: ai.sources.map(s => s.noteId), sources: ai.sources, title: map.title, options: map.options, operation: ai.operation, graph: ai.operation !== 'generate' ? validateGraph(map) : undefined, targetId: ai.target });
      if (request.current === id) setAI({ ...ai, result });
    } catch (e) { if (request.current === id) setPageError(e instanceof Error ? e.message : '生成失败'); } finally { if (request.current === id) { request.current = ''; setAIBusy(false); } }
  };
  const applyAI = async (asNew = false) => {
    if (!ai?.result || !map) return;
    const result = ai.result;
    if (asNew) { if (await onGenerated(result)) cancelAI(); return; }
    if (editor.version.current !== ai.stamp || map.id !== ai.baseId) { setPageError('导图在生成期间已修改，请另存结果或重新生成'); return; }
    if (ai.operation === 'generate') {
      if (!window.confirm('确认替换当前导图？人工修改将被替换，可撤销此操作。')) return;
      editor.edit(result); setSelected(result.rootId);
    } else {
      const oldNode = map.nodes.find(n => n.id === ai.target)!;
      const removed = descendants(map, ai.target); removed.delete(ai.target);
      const root = result.nodes.find(n => n.id === result.rootId)!;
      const nodes = result.nodes.map(n => n.id === root.id ? { ...n, id: oldNode.id, parentId: oldNode.parentId } : { ...n, parentId: n.parentId === root.id ? oldNode.id : n.parentId });
      try { const merged = validateDraft({ ...map, sources: result.sources, nodes: [...map.nodes.filter(n => !removed.has(n.id) && n.id !== ai.target), ...nodes], relations: [...map.relations.filter(r => !removed.has(r.sourceId) && !removed.has(r.targetId)), ...result.relations.map(r => ({ ...r, sourceId: r.sourceId === root.id ? oldNode.id : r.sourceId, targetId: r.targetId === root.id ? oldNode.id : r.targetId }))] }); if (!editor.edit(merged)) return; }
      catch (e) { editor.setError(e instanceof Error ? e.message : '应用失败'); return; }
    }
    cancelAI();
  };
  const importFile = async (input: File) => {
    try {
      if (input.size > 2 * 1024 * 1024) throw new Error('导入文件不能超过 2MB');
      const draft = importMap(await input.text());
      // Imported source identifiers are snapshots, never silently linked to this library.
      const sources = readSources(draft.sources), replacements = new Map(sources.map(s => [s.noteId, createId('imported')]));
      draft.sources = sources.map(s => ({ ...s, noteId: replacements.get(s.noteId)! }));
      draft.nodes = draft.nodes.map(n => ({ ...n, sourceRefs: n.sourceRefs.map(r => ({ ...r, noteId: replacements.get(r.noteId) ?? createId('imported') })) }));
      if (await onGenerated(draft)) setMessage('已导入为新导图预览，来源保留为快照，请保存。');
    } catch (e) { setPageError(e instanceof Error ? e.message : '导入失败'); }
  };
  const exportFile = async (format: 'png' | 'md' | 'json') => {
    if (!map) return; setExportBusy(true); setPageError('');
    try { const content = format === 'json' ? backupMap(map) : format === 'md' ? mapMarkdown(map) : await mapPNG(map, view.collapsedIds, exportFull); const outcome = await api.exportFile(map.title, format, content); setMessage(outcome.saved ? '导出成功' : '已取消导出'); if (outcome.saved) setExportOpen(false); }
    catch (e) { setPageError(e instanceof Error ? e.message : '导出失败'); } finally { setExportBusy(false); }
  };
  const review = async () => {
    if (!map || !node) return;
    if (!map.id && !(await editor.savePreview())) return;
    if (map.id && !(await editor.save())) return;
    const saved = editor.current.current!; navigate(`${ROUTES.review}?map=${encodeURIComponent(saved.id)}&node=${encodeURIComponent(node.id)}`);
  };
  return <section ref={container} className={styles.page} aria-label="思维导图" onKeyDown={event => { if (event.key === 'Escape' && (container.current?.clientWidth ?? 1200) < 1100) { setLeftOpen(false); setRightOpen(false); } }}>
    <header className={styles.header}><div><h1>{map?.title ?? '思维导图'}</h1><p>{map ? `${map.sources.length} 篇来源笔记 · ${editor.state}` : '从学习笔记整理知识结构'}</p></div><div className={styles.headerActions}>
      <IconButton icon={PanelLeft} label="导图列表" onClick={() => { setLeftOpen(v => v === null ? (container.current?.clientWidth ?? 1200) < 1100 : !v); if ((container.current?.clientWidth ?? 1200) < 800) setRightOpen(false); }}/><IconButton icon={PanelRight} label="节点详情" onClick={() => { setRightOpen(v => v === null ? (container.current?.clientWidth ?? 1200) < 800 : !v); if ((container.current?.clientWidth ?? 1200) < 800) setLeftOpen(false); }}/>
      <Button variant="secondary" icon={Plus} onClick={() => setSetup(true)}>从笔记生成</Button>{map && <>{!map.id && <Button variant="ghost" onClick={() => void discardPreview()}>放弃预览</Button>}<Button variant="secondary" icon={Save} onClick={() => void (map.id ? editor.save() : editor.savePreview())}>保存</Button><Button variant="secondary" icon={Sparkles} onClick={() => void loadAI('generate')}>重新生成</Button><IconButton icon={Download} label="导出导图" onClick={() => setExportOpen(true)}/></>}
    </div></header>
    {(pageError || editor.error || message) && <div className={pageError || editor.error ? styles.errorBar : styles.messageBar} role={pageError || editor.error ? 'alert' : 'status'}><span>{pageError || editor.error || message}</span>{editor.state === '保存失败' && <><Button variant="ghost" onClick={() => void editor.save()}>重试保存</Button><Button variant="ghost" onClick={() => void editor.save(true)}>另存草稿</Button></>}<IconButton icon={X} label="关闭提示" onClick={() => { setPageError(''); editor.setError(''); setMessage(''); }}/></div>}
    <div className={styles.workspace}>
      <aside className={`${styles.list} ${leftOpen === false ? styles.panelClosed : leftOpen ? styles.panelOpen : ''}`}><div className={styles.row}><h2>我的导图</h2><IconButton icon={X} label="收起导图列表" onClick={() => setLeftOpen(false)}/></div><input aria-label="搜索导图" placeholder="搜索导图" value={search} onChange={e => setSearch(e.target.value)}/>
        <div className={styles.mapList}>{maps.filter(m => m.title.toLowerCase().includes(search.toLowerCase())).map(m => <div key={m.id} className={`${styles.mapItem} ${m.id === map?.id ? styles.activeMap : ''}`}><button onClick={() => void open(m)}><strong>{m.title}</strong><small>{m.sources.length} 篇笔记 · {new Date(m.updatedAt).toLocaleDateString('zh-CN')}</small></button><button aria-label={`删除导图 ${m.title}`} className={styles.removeMap} onClick={() => setDeletion({ type: 'map', id: m.id, count: 1 })}>×</button></div>)}{!maps.length && <p className={styles.muted}>{loading ? '读取中…' : '保存后的导图会出现在这里'}</p>}</div>
        <Button variant="ghost" icon={Upload} onClick={() => file.current?.click()}>导入 JSON</Button><input ref={file} type="file" accept=".json,application/json" hidden onChange={e => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = ''; }}/>
      </aside>
      {map ? <MindMapCanvas graph={map} selected={selected} onSelect={id => { setSelected(id); if (id) { setRightOpen(true); if ((container.current?.clientWidth ?? 1200) < 800) setLeftOpen(false); } }} view={view} onView={setView} onAdd={add} onDelete={deleteNode} onEdit={focusTitle} onUndo={editor.undo} onRedo={editor.redo} canUndo={editor.canUndo} canRedo={editor.canRedo} onHelp={() => setHelp(true)}/> : <div className={styles.empty}><GitBranch size={42}/><h2>把零散笔记，整理成清晰的知识结构</h2><p>选择笔记，让 AI 梳理概念、代码示例和知识关联。</p><Button onClick={() => setSetup(true)}>从笔记生成</Button><Button variant="ghost" onClick={() => file.current?.click()}>导入已有导图</Button></div>}
      {map && <aside className={`${styles.details} ${rightOpen === false ? styles.panelClosed : rightOpen ? styles.panelOpen : ''}`}><div className={styles.row}><h2>节点详情</h2><IconButton icon={X} label="收起节点详情" onClick={() => setRightOpen(false)}/></div><label>导图标题<input aria-label="导图标题" maxLength={80} value={map.title} onChange={e => { if (e.target.value.trim()) editor.edit({ ...map, title: e.target.value }); }}/></label>{node ? <MindMapDetails map={map} node={node} onChange={next => editor.edit({ ...map, nodes: map.nodes.map(n => n.id === next.id ? next : n) })} onAdd={add} onDelete={deleteNode} onMove={parent => { try { editor.edit({ ...map, ...moveNode(map, node.id, parent) }); } catch (e) { editor.setError(e instanceof Error ? e.message : '移动失败'); } }} onAI={op => void loadAI(op)} onReview={() => void review()}/> : <p className={styles.muted}>选择一个节点以查看详情</p>}</aside>}
    </div>
    {setup && <MindMapSetup api={api} initialIds={params.get('note') ? [params.get('note')!] : []} onClose={() => setSetup(false)} onGenerated={onGenerated}/>}
    <ConfirmDialog open={!!deletion} title={deletion?.type === 'node' ? `删除 ${deletion.count} 个节点？` : '删除这张导图？'} description={deletion?.type === 'node' ? '将删除选中节点及后代，相关关联也会移除。可以撤销此操作。' : '删除后无法从列表恢复，请先导出需要的备份。'} confirmLabel="确认删除" onCancel={() => setDeletion(null)} onConfirm={() => void remove()}/>
    <Modal open={help} onClose={() => setHelp(false)} title="思维导图快捷键"><dl className={styles.shortcuts}>{[['Enter', '添加同级节点'], ['Tab', '添加子节点'], ['F2 / 双击', '编辑节点标题'], ['Delete', '删除节点或分支'], ['Ctrl Z', '撤销'], ['Ctrl Shift Z', '重做'], ['Ctrl F', '搜索并定位节点'], ['Ctrl S', '保存'], ['Esc', '关闭浮层或清除选择']].map(([key, text]) => <div key={key}><dt><kbd>{key}</kbd></dt><dd>{text}</dd></div>)}</dl><p>画布快捷键只在画布获得焦点时生效。文本输入保留原有键盘行为。</p></Modal>
    <Modal open={exportOpen} onClose={() => setExportOpen(false)} title="导出思维导图" footer={<Button variant="secondary" onClick={() => setExportOpen(false)}>关闭</Button>}><p>PNG 导出完整画布；Markdown 导出层级、代码与来源；JSON 可用于备份和恢复。</p><label className={styles.check}><input type="checkbox" checked={exportFull} onChange={e => setExportFull(e.target.checked)}/>PNG 展开所有分支</label><div className={styles.grid}>{(['png', 'md', 'json'] as const).map(f => <Button key={f} disabled={exportBusy} onClick={() => void exportFile(f)}>{f === 'md' ? 'Markdown' : f.toUpperCase()}</Button>)}</div>{pageError && <p role="alert">{pageError}</p>}</Modal>
    <Modal open={!!ai} onClose={cancelAI} title={ai?.result ? '预览 AI 调整' : ai?.operation === 'generate' ? '重新生成导图' : '调整选中分支'} wide footer={<><Button variant="secondary" onClick={cancelAI}>{aiBusy ? '取消生成' : '取消'}</Button>{ai?.result ? <><Button variant="secondary" onClick={() => void applyAI(true)}>另存新导图</Button><Button onClick={() => void applyAI()}>{ai.operation === 'generate' ? '替换当前导图' : '应用分支'}</Button></> : <Button disabled={aiBusy} onClick={() => void generateAI()}>{aiBusy ? '正在整理…' : '确认发送并生成'}</Button>}</>}>
      <div className={styles.setup}>{pageError && <p role="alert" className={styles.error}>{pageError}</p>}{ai?.result ? <><p>新结果 {ai.result.nodes.length} 个节点。{ai.operation !== 'generate' && map ? `将替换原分支 ${descendants(map, ai.target).size} 个节点。` : '原有内容保留到你确认替换。'}</p><h3>原有结构</h3><p>{map?.nodes.filter(n => ai.operation === 'generate' || descendants(map, ai.target).has(n.id)).map(n => n.title).join(' · ')}</p><h3>生成的结构</h3><ul>{ai.result.nodes.map(n => <li key={n.id}><strong>{n.title}</strong>{n.isSupplement ? ' · AI 补充' : ''}<p>{n.description}</p></li>)}</ul></> : <><p>将发送下面的笔记正文，以及当前导图结构（包含你编辑的节点内容），仅调整确认的范围。</p>{ai?.sources.map(s => <details key={s.noteId}><summary>{s.noteTitle}</summary><pre className={styles.sourceText}>{s.contentExcerpt}</pre></details>)}</>}</div>
    </Modal>
  </section>;
}
