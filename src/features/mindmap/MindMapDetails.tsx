import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { highlightCode } from '../../lib/highlight';
import { NODE_KINDS, descendants, type MindMap, type MindMapNode } from '../../lib/mindmap';
import { ROUTES } from '../../app/routes';
import { useLibrary } from '../../app/LibraryProvider';
import styles from './mindmap.module.css';

const LABELS = { concept: '概念', syntax: '语法', example: '示例', pitfall: '易错点', comparison: '概念比较', prerequisite: '前置知识', scenario: '适用场景' };
function CodeExample({ code, language }: { code: string; language: string }) {
  const { settings } = useLibrary(); const [html, setHtml] = useState('');
  useEffect(() => { let active = true; void highlightCode(code, language, settings?.theme === 'dark' ? 'dark' : 'light').then(h => { if (active) setHtml(h); }).catch(() => setHtml('')); return () => { active = false; }; }, [code, language, settings?.theme]);
  return <div className={styles.code}>{html ? <div dangerouslySetInnerHTML={{ __html: html }} /> : <pre>{code}</pre>}</div>;
}
export function MindMapDetails({ map, node, onChange, onAdd, onDelete, onMove, onAI, onReview }: { map: MindMap; node: MindMapNode; onChange(node: MindMapNode): void; onAdd(sibling: boolean): void; onDelete(): void; onMove(parentId: string): void; onAI(operation: 'expand' | 'simplify'): void; onReview(): void }) {
  const { notes } = useLibrary();
  const excluded = descendants(map, node.id);
  return <div className={styles.detailsContent}>
    <label>节点标题<input id="mindmap-node-title" aria-label="节点标题" maxLength={80} value={node.title} onChange={e => { if (e.target.value.trim()) onChange({ ...node, title: e.target.value }); }} /></label>
    <label>知识类型<select value={node.kind} onChange={e => onChange({ ...node, kind: e.target.value as MindMapNode['kind'] })}>{NODE_KINDS.map(k => <option key={k} value={k}>{LABELS[k]}</option>)}</select></label>
    {node.isSupplement && <p className={styles.notice}>AI 补充知识 · 请结合教材核实</p>}
    {node.origin === 'user' && <small>人工编辑节点</small>}
    <label>解释<textarea aria-label="节点解释" maxLength={2000} rows={5} value={node.description} onChange={e => onChange({ ...node, description: e.target.value })} /></label>
    <h3>代码示例</h3>
    {node.codeExamples.map((c, i) => <div key={i} className={styles.codeEditor}><label>语言<input maxLength={40} value={c.language} onChange={e => onChange({ ...node, codeExamples: node.codeExamples.map((v, j) => i === j ? { ...v, language: e.target.value || 'text' } : v) })} /></label><CodeExample {...c}/><textarea aria-label={`代码示例 ${i + 1}`} maxLength={8000} rows={4} value={c.code} onChange={e => onChange({ ...node, codeExamples: node.codeExamples.map((v, j) => i === j ? { ...v, code: e.target.value || ' ' } : v) })} /><Button variant="ghost" onClick={() => onChange({ ...node, codeExamples: node.codeExamples.filter((_, j) => i !== j) })}>删除此示例</Button></div>)}
    <Button variant="secondary" disabled={node.codeExamples.length >= 4} onClick={() => onChange({ ...node, codeExamples: [...node.codeExamples, { language: 'text', code: '// 在这里添加代码' }] })}>添加代码示例</Button>
    <h3>来源笔记</h3>
    {(node.sourceRefs.length ? node.sourceRefs : map.sources.map(s => ({ noteId: s.noteId, quote: '' }))).map((ref, i) => {
      const source = map.sources.find(s => s.noteId === ref.noteId), live = notes.find(n => n.id === ref.noteId);
      return <div key={i} className={styles.sourceCard}>{live ? <Link to={ROUTES.note(live.id)}>{source?.noteTitle ?? live.title} ↗</Link> : <strong>{source?.noteTitle ?? '原始笔记'} · 来源不可用</strong>}<small>{source?.courseName}{live && live.updatedAt !== source?.noteUpdatedAt ? ' · 来源已更新' : ''}</small>{ref.quote && <blockquote>{ref.quote}</blockquote>}</div>;
    })}
    {!node.sourceRefs.length && !map.sources.length && <small>尚未关联来源笔记</small>}
    {node.parentId !== null && <label>移动到父节点<select value={node.parentId} onChange={e => onMove(e.target.value)}>{map.nodes.filter(n => !excluded.has(n.id)).map(n => <option key={n.id} value={n.id}>{n.title}</option>)}</select></label>}
    <div className={styles.grid}><Button variant="secondary" onClick={() => onAdd(false)} title="Tab">添加子节点</Button><Button variant="secondary" onClick={() => onAdd(true)} title="Enter">添加同级</Button></div>
    <div className={styles.grid}><Button variant="secondary" onClick={() => onAI('expand')}>AI 扩展</Button><Button variant="secondary" onClick={() => onAI('simplify')}>精简分支</Button></div>
    <Button onClick={onReview}>生成复习题</Button>
    {node.parentId !== null && <Button variant="ghost" onClick={onDelete} title="Delete">删除节点 / 分支</Button>}
  </div>;
}
