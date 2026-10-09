import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { CalendarDays, ChevronRight, Eye, PanelLeftOpen, Plus, Save, X } from 'lucide-react';
import { Button, IconButton } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { useLibrary } from '../../app/LibraryProvider';
import { asDoc, docToPlainText, noteStats } from '../../lib/noteDoc';
import { EMPTY_MORNING_CONTENT, sortMorningNotes, todayDate, type MorningNote } from '../../lib/morningNotes';
import { NoteEditor } from '../notes/NoteEditor';
import { EditorToolbar, type EditorMode } from '../notes/EditorToolbar';
import { morningApi } from './repository';
import { useMorningDraft } from './useMorningDraft';
import noteStyles from '../notes/notes.module.css';
import styles from './morning.module.css';

export function MorningPage() {
  const api = useMemo(() => morningApi(), []), { settings } = useLibrary();
  const [records, setRecords] = useState<MorningNote[]>([]), [loading, setLoading] = useState(true), [pageError, setPageError] = useState('');
  const [editor, setEditor] = useState<Editor | null>(null), [mode, setMode] = useState<EditorMode>('edit');
  const [createOpen, setCreateOpen] = useState(false), [createDate, setCreateDate] = useState(todayDate()), [createTitle, setCreateTitle] = useState('');
  const [busy, setBusy] = useState(false), [createError, setCreateError] = useState(''), [query, setQuery] = useState(''), [listOpen, setListOpen] = useState(false);
  const [stats, setStats] = useState({ words: 0, codeBlocks: 0, minutes: 1 });
  const onSaved = useCallback((saved: MorningNote) => setRecords(items => sortMorningNotes([saved, ...items.filter(n => n.id !== saved.id)])), []);
  const draft = useMorningDraft(api, onSaved, settings.autoSaveDelayMs);
  const { note } = draft;
  const onReady = useCallback((instance: Editor) => { setEditor(instance); setStats(noteStats(asDoc(instance.getJSON()))); }, []);
  const changeBody = useCallback((json: string) => { draft.edit({ contentJson: json }); setStats(noteStats(asDoc(JSON.parse(json)))); }, [draft.edit]);
  const load = useCallback(async () => {
    setLoading(true); setPageError('');
    try { const items = await api.list(); setRecords(items); if (items[0]) await draft.open(items[0]); }
    catch (cause) { setPageError(cause instanceof Error ? cause.message : '读取晨考失败'); }
    finally { setLoading(false); }
  }, [api, draft.open]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const preview = () => setMode(value => value === 'edit' ? 'preview' : 'edit');
    const newRecord = () => { setCreateDate(todayDate()); setCreateTitle(''); setCreateError(''); setCreateOpen(true); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setListOpen(false); };
    window.addEventListener('maji:toggle-preview', preview); window.addEventListener('maji:morning-new', newRecord); window.addEventListener('keydown', escape);
    return () => { window.removeEventListener('maji:toggle-preview', preview); window.removeEventListener('maji:morning-new', newRecord); window.removeEventListener('keydown', escape); };
  }, []);
  const open = async (next: MorningNote) => {
    if (busy) return; setBusy(true);
    try { if (await draft.open(next)) { setMode('edit'); setListOpen(false); } }
    finally { setBusy(false); }
  };
  const startCreate = () => { setCreateDate(todayDate()); setCreateTitle(''); setCreateError(''); setCreateOpen(true); };
  const create = async () => {
    setBusy(true); setCreateError('');
    try {
      if (!(await draft.save())) { setCreateError('请先保存当前晨考，再创建新的记录'); return; }
      const saved = await api.create({ date: createDate, title: createTitle.trim() || `${createDate} 晨考`, contentJson: EMPTY_MORNING_CONTENT });
      onSaved(saved); if (await draft.open(saved)) { setCreateOpen(false); setMode('edit'); setListOpen(false); }
    } catch (cause) { setCreateError(cause instanceof Error ? cause.message : '创建晨考失败'); }
    finally { setBusy(false); }
  };
  const filtered = records.filter(n => `${n.date} ${n.title}`.toLowerCase().includes(query.toLowerCase()));
  return <section className={styles.workspace} aria-label="晨考">
    {listOpen && <button className={styles.backdrop} aria-label="关闭晨考列表遮罩" onClick={() => setListOpen(false)}/>}
    <aside className={`${styles.list} ${listOpen ? styles.listOpen : ''}`} aria-label="晨考记录列表">
      <div className={styles.listHeader}><h2><CalendarDays size={18}/> 晨考</h2><IconButton icon={X} label="收起晨考列表" onClick={() => setListOpen(false)} className={styles.narrow}/></div>
      <p className={styles.hint}>按日期整理老师的概念题与答案</p>
      <Button icon={Plus} onClick={startCreate} disabled={busy || loading}>新增晨考</Button>
      <input className={styles.search} aria-label="搜索晨考日期或标题" placeholder="搜索日期、标题…" value={query} onChange={e => setQuery(e.target.value)}/>
      <div className={styles.records}>
        {filtered.map(item => <button key={item.id} className={`${styles.record} ${note?.id === item.id ? styles.selected : ''}`} aria-label={`打开晨考：${item.title}（${item.date}）`} aria-current={note?.id === item.id ? 'true' : undefined} disabled={busy} onClick={() => void open(item)}><time dateTime={item.date}>{item.date}</time><strong>{item.title}</strong><span>{docToPlainText(asDoc(JSON.parse(item.contentJson))).slice(0, 70) || '还没有正文'}</span></button>)}
        {!loading && !filtered.length && <p className={styles.hint}>{query ? '没有匹配的记录' : '新增一份晨考，开始整理内容。'}</p>}
      </div>
    </aside>
    <div className={`${noteStyles.center} ${styles.center}`}>
      <header className={styles.mobileHeader}><IconButton icon={PanelLeftOpen} label="展开晨考列表" onClick={() => setListOpen(true)}/><span>晨考</span><Button icon={Plus} variant="secondary" onClick={startCreate} disabled={busy || loading}>新增晨考</Button></header>
      {(pageError || draft.error) && <div role="alert" className={styles.error}><span>{draft.error || pageError}</span><Button variant="ghost" onClick={() => void (draft.error ? draft.save() : load())}>重试</Button></div>}
      {loading ? <p className={styles.loading}>正在打开晨考…</p> : note ? <>
        <div className={noteStyles.docHeader}>
          <div className={noteStyles.breadcrumb}><span>晨考</span><ChevronRight size={13}/><time dateTime={note.date}>{note.date}</time></div>
          <div className={noteStyles.titleRow}><input className={noteStyles.titleInput} aria-label="晨考标题" maxLength={200} value={note.title} readOnly={mode === 'preview'} onChange={e => draft.edit({ title: e.target.value })}/><Button icon={Save} variant="secondary" title="Ctrl+S" disabled={draft.status === '保存中'} onClick={() => void draft.save()}>保存</Button></div>
          <div className={styles.meta}><label>日期 <input type="date" aria-label="晨考日期" value={note.date} readOnly={mode === 'preview'} onChange={e => draft.edit({ date: e.target.value })}/></label><span role="status" aria-label="晨考保存状态">{draft.status}</span></div>
        </div>
        <EditorToolbar editor={editor} mode={mode} onModeChange={setMode} language="text" stats={stats} showAI={false}/>
        {mode === 'preview' && <div className={noteStyles.previewNotice}><Eye size={13}/>阅读预览 · 按 Ctrl+P 或点击「编辑」继续修改</div>}
        <div className={noteStyles.scroll} data-editor-scroll><div className={noteStyles.paper}><NoteEditor key={note.id} content={draft.initialContent} editable={mode === 'edit'} onChange={changeBody} onReady={onReady} label="晨考正文"/></div></div>
      </> : <EmptyState icon={CalendarDays} title="还没有晨考记录" description="把老师发来的概念题与答案整理在这里，按日期保存，随时查看。" actions={<Button icon={Plus} onClick={startCreate}>新增晨考</Button>}/>}
    </div>
    <Modal open={createOpen} onClose={() => { if (!busy) setCreateOpen(false); }} title="新增晨考" description="选择记录日期，题目和答案可以在正文中自由整理。" icon={CalendarDays} footer={<><Button variant="secondary" disabled={busy} onClick={() => setCreateOpen(false)}>取消</Button><Button disabled={busy} onClick={() => void create()}>{busy ? '创建中…' : '创建'}</Button></>}>
      <div className={styles.form}><label>日期<input aria-label="日期" type="date" value={createDate} onChange={e => setCreateDate(e.target.value)} disabled={busy}/></label><label>标题<input aria-label="标题" maxLength={200} value={createTitle} placeholder="例如：Spring IOC 与依赖注入" onChange={e => setCreateTitle(e.target.value)} disabled={busy}/></label>{createError && <p role="alert" className={styles.error}>{createError}</p>}</div>
    </Modal>
  </section>;
}
