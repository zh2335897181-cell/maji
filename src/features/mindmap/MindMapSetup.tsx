import { useEffect, useRef, useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { useLibrary } from '../../app/LibraryProvider';
import { DEFAULT_MAP_OPTIONS, type MindMapApi, type MindMapDraft, type MindMapOptions, type MindMapSource } from '../../lib/mindmap';
import { createId } from '../../lib/text';
import styles from './mindmap.module.css';

export function MindMapSetup({ api, initialIds = [], onClose, onGenerated }: { api: MindMapApi; initialIds?: string[]; onClose(): void; onGenerated(draft: MindMapDraft): void | boolean | Promise<void | boolean> }) {
  const { notes, courses } = useLibrary();
  const [ids, setIds] = useState(initialIds), [course, setCourse] = useState(''), [search, setSearch] = useState('');
  const [title, setTitle] = useState(''), [options, setOptions] = useState<MindMapOptions>({ ...DEFAULT_MAP_OPTIONS });
  const [preview, setPreview] = useState<MindMapSource[] | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [provider, setProvider] = useState('桌面版 AI 服务'), [requestId, setRequestId] = useState('');
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [includeArchived, setIncludeArchived] = useState(false);
  const alive = useRef(true), activeRequest = useRef('');
  const generatedResult = useRef<MindMapDraft | null>(null);
  useEffect(() => {
    let active = true;
    if (window.maji?.ai) void window.maji.ai.getSettings().then(s => { if (active) { setConfigured(s.configured); setProvider(`${s.baseUrl} · ${s.model}`); } }).catch(() => { if (active) setError('读取 AI 设置失败'); });
    else setConfigured(false);
    return () => { active = false; };
  }, []);
  useEffect(() => { alive.current = true; return () => { alive.current = false; const id = activeRequest.current; activeRequest.current = ''; if (id) void api.cancel(id).catch(() => {}); }; }, [api]);
  const close = () => { const id = activeRequest.current; activeRequest.current = ''; if (id) void api.cancel(id).catch(() => {}); onClose(); };
  const available = notes.filter(n => (includeArchived || !n.archived) && (!course || n.courseId === course) && n.title.toLowerCase().includes(search.toLowerCase()));
  const changeOptions = (patch: Partial<MindMapOptions>) => { setOptions(v => ({ ...v, ...patch })); setPreview(null); };
  const confirm = async () => {
    generatedResult.current = null;
    setBusy(true); setError('');
    try { const sources = await api.preview(ids); setPreview(sources); if (!title) setTitle(sources[0]?.noteTitle.slice(0, 80) ?? '学习笔记'); }
    catch (e) { setError(e instanceof Error ? e.message : '读取来源失败'); } finally { setBusy(false); }
  };
  const generate = async () => {
    if (!preview) return;
    const id = createId('request'); activeRequest.current = id; setRequestId(id); setBusy(true); setError('');
    try { const result = generatedResult.current ?? await api.generate({ requestId: id, noteIds: ids, sources: preview, title, options }); if (alive.current && activeRequest.current === id) { generatedResult.current = result; if ((await onGenerated(result)) === false) setError('已保留当前预览，本次生成结果也仍然保留。保存当前导图后可以再次应用。'); } }
    catch (e) { if (alive.current && activeRequest.current === id) setError(e instanceof Error ? e.message : '生成失败'); }
    finally { if (alive.current && activeRequest.current === id) { activeRequest.current = ''; setBusy(false); setRequestId(''); } }
  };
  return <Modal open title="从笔记生成思维导图" wide onClose={close}
    footer={<><Button variant="secondary" onClick={close}>{requestId ? '取消生成' : '取消'}</Button>{preview ? <Button disabled={busy || configured !== true} onClick={() => void generate()}>{requestId ? '正在整理知识结构…' : '确认发送并生成'}</Button> : <Button disabled={busy || !ids.length} onClick={() => void confirm()}>{busy ? '读取中…' : '预览发送范围'}</Button>}</>}>
    <div className={styles.setup}>
      {configured === false ? <div className={styles.notice}>AI 生成需要已配置的桌面版 AI 服务。<Button variant="ghost" onClick={() => window.dispatchEvent(new Event('maji:open-ai-settings'))}>配置 AI 服务</Button></div> : null}
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {!preview ? <>
        <label>来源课程<select value={course} onChange={e => setCourse(e.target.value)}><option value="">全部课程</option>{courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label>搜索笔记<input value={search} onChange={e => setSearch(e.target.value)} placeholder="输入笔记标题" /></label>
        <div className={styles.row}><span>已选 {ids.length}/12 篇</span><Button variant="ghost" onClick={() => setIds(available.slice(0, 12).map(n => n.id))}>选择当前列表</Button><Button variant="ghost" onClick={() => setIds([])}>清空</Button></div>
        <label className={styles.check}><input type="checkbox" checked={includeArchived} onChange={e => setIncludeArchived(e.target.checked)}/>显示归档笔记</label>
        <div className={styles.sourceList}>{available.map(n => <label className={styles.check} key={n.id}><input type="checkbox" checked={ids.includes(n.id)} disabled={!ids.includes(n.id) && ids.length >= 12} onChange={() => setIds(v => v.includes(n.id) ? v.filter(id => id !== n.id) : [...v, n.id])} /><span>{n.title}<small>{n.courseName}{n.archived ? ' · 已归档' : ''}</small></span></label>)}{!available.length && <p>没有匹配的笔记</p>}</div>
        <label>导图标题<input maxLength={80} value={title} onChange={e => setTitle(e.target.value)} placeholder="根据所选笔记自动建议" /></label>
        <div className={styles.grid}><label>详细程度<select value={options.depth} onChange={e => changeOptions({ depth: e.target.value as MindMapOptions['depth'] })}><option value="quick">简洁 · 核心概念</option><option value="standard">标准 · 概念与实例</option><option value="deep">深入 · 边界与关联</option></select></label>
        <label>组织方式<select value={options.organization} onChange={e => changeOptions({ organization: e.target.value as MindMapOptions['organization'] })}><option value="knowledge">知识结构</option><option value="route">学习路线</option><option value="review">复习提纲</option></select></label></div>
        <label className={styles.check}><input type="checkbox" checked={options.includeCode} onChange={e => changeOptions({ includeCode: e.target.checked })} />包含代码示例</label>
        <label className={styles.check}><input type="checkbox" checked={options.highlightPitfalls} onChange={e => changeOptions({ highlightPitfalls: e.target.checked })} />突出易错点和知识关联</label>
        <label className={styles.check}><input type="checkbox" checked={options.allowSupplement} onChange={e => changeOptions({ allowSupplement: e.target.checked })} />允许 AI 补充知识（将明确标记）</label>
      </> : <>
        <p>将向 <strong>{provider}</strong> 发送以下 {preview.length} 篇笔记，共 {preview.reduce((s, n) => s + n.contentExcerpt.length, 0)} 字符。费用由服务商按实际请求计收。</p>
        {preview.map(s => <details key={s.noteId}><summary>{s.noteTitle} · {s.courseName}</summary><pre className={styles.sourceText}>{s.contentExcerpt}</pre></details>)}
        <Button variant="ghost" disabled={busy} onClick={() => setPreview(null)}>返回修改范围</Button>
      </>}
    </div>
  </Modal>;
}
