import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Minus, Plus, Scan, Undo2, Redo2, Keyboard, ListTree } from 'lucide-react';
import { IconButton, Button } from '../../components/ui/Button';
import { descendants, layoutGraph, type MindMapGraph, type MindMapView } from '../../lib/mindmap';
import styles from './mindmap.module.css';

export const DEFAULT_VIEW: MindMapView = { collapsedIds: [], x: 30, y: 70, zoom: 1 };
export function MindMapCanvas({ graph, selected, onSelect, view, onView, onAdd, onDelete, onEdit, onUndo, onRedo, canUndo, canRedo, onHelp }: {
  graph: MindMapGraph; selected: string | null; onSelect(id: string | null): void; view: MindMapView; onView(view: MindMapView): void;
  onAdd(sibling: boolean): void; onDelete(): void; onEdit(): void; onUndo(): void; onRedo(): void; canUndo: boolean; canRedo: boolean; onHelp(): void;
}) {
  const svg = useRef<SVGSVGElement>(null), drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const [outline, setOutline] = useState(false), [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const layout = useMemo(() => layoutGraph(graph, view.collapsedIds), [graph, view.collapsedIds]);
  const toggle = (id: string) => onView({ ...view, collapsedIds: view.collapsedIds.includes(id) ? view.collapsedIds.filter(n => n !== id) : [...view.collapsedIds, id] });
  const center = () => {
    const rect = svg.current?.getBoundingClientRect(); if (!rect) return;
    const zoom = Math.max(.2, Math.min(1.5, (rect.width - 60) / layout.width, (rect.height - 100) / layout.height));
    onView({ ...view, zoom, x: (rect.width - layout.width * zoom) / 2, y: (rect.height - layout.height * zoom) / 2 });
  };
  useEffect(() => { if (view.x === DEFAULT_VIEW.x && view.y === DEFAULT_VIEW.y) center(); }, [graph.rootId]);
  const zoom = (factor: number) => {
    const rect = svg.current?.getBoundingClientRect(), next = Math.max(.2, Math.min(2.5, view.zoom * factor));
    const x = (rect?.width ?? 800) / 2, y = (rect?.height ?? 600) / 2;
    onView({ ...view, zoom: next, x: x - (x - view.x) * next / view.zoom, y: y - (y - view.y) * next / view.zoom });
  };
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('input,textarea,select,[contenteditable="true"]')) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? onRedo() : onUndo(); }
    else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') { event.preventDefault(); searchRef.current?.focus(); }
    else if (selected && event.key === 'Tab' && !event.shiftKey) { event.preventDefault(); onAdd(false); }
    else if (selected && event.key === 'Enter') { event.preventDefault(); onAdd(true); }
    else if (selected && event.key === 'Delete') { event.preventDefault(); onDelete(); }
    else if (selected && event.key === 'F2') { event.preventDefault(); onEdit(); }
    else if (event.key === 'Escape') { setSearch(''); onSelect(null); }
  };
  const matches = graph.nodes.filter(n => n.title.toLowerCase().includes(search.toLowerCase()));
  const locate = (id: string) => {
    const collapsedIds = view.collapsedIds.filter(collapsed => !descendants(graph, collapsed).has(id));
    const p = layoutGraph(graph, collapsedIds).positions.get(id), rect = svg.current?.getBoundingClientRect();
    onView({ ...view, collapsedIds, x: p ? (rect?.width ?? 800) / 2 - (p.x + 90) * view.zoom : view.x, y: p ? (rect?.height ?? 600) / 2 - p.y * view.zoom : view.y }); onSelect(id); setSearch('');
  };
  const renderOutline = (id: string): React.ReactNode => {
    const n = graph.nodes.find(n => n.id === id)!;
    return <li key={id}><button onClick={() => onSelect(id)} aria-pressed={id === selected}>{n.title}</button>{graph.nodes.some(c => c.parentId === id) && <ul>{graph.nodes.filter(c => c.parentId === id).map(c => renderOutline(c.id))}</ul>}</li>;
  };
  return <div className={styles.canvas} tabIndex={0} aria-label="思维导图画布" onKeyDown={onKey}>
    <div className={styles.canvasSearch}><input ref={searchRef} value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索节点 · Ctrl F" aria-label="搜索节点" onKeyDown={e => { if (e.key === 'Enter' && matches[0]) locate(matches[0].id); }} />{search && <div className={styles.results}>{matches.map(n => <button key={n.id} onClick={() => locate(n.id)}>{n.title}</button>)}{!matches.length && <span>没有匹配节点</span>}</div>}</div>
    {outline ? <div className={styles.outline}><ul>{renderOutline(graph.rootId)}</ul></div> : <svg ref={svg} className={styles.svg} aria-label="知识结构" onWheel={e => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); zoom(e.deltaY > 0 ? .9 : 1.1); } else onView({ ...view, x: view.x - e.deltaX, y: view.y - e.deltaY }); }}
      onPointerDown={e => { if (!(e.target as Element).closest('[data-node]')) { drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }; e.currentTarget.setPointerCapture(e.pointerId); } }}
      onPointerMove={e => { if (drag.current) onView({ ...view, x: drag.current.vx + e.clientX - drag.current.x, y: drag.current.vy + e.clientY - drag.current.y }); }}
      onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
      <g transform={`translate(${view.x},${view.y}) scale(${view.zoom})`}>
        {graph.nodes.map(n => { const p = layout.positions.get(n.id), parent = n.parentId && layout.positions.get(n.parentId); return p && parent ? <path key={`edge-${n.id}`} className={styles.edge} d={`M${parent.x + 180} ${parent.y} C${parent.x + 210} ${parent.y},${p.x - 30} ${p.y},${p.x} ${p.y}`} /> : null; })}
        {graph.relations.filter(r => r.sourceId === selected || r.targetId === selected).map((r, i) => { const a = layout.positions.get(r.sourceId), b = layout.positions.get(r.targetId); return a && b ? <g key={i}><path className={styles.relation} d={`M${a.x + 90} ${a.y + 26} Q${Math.max(a.x, b.x) + 220} ${(a.y + b.y) / 2},${b.x + 90} ${b.y + 26}`} /><title>{r.label}</title></g> : null; })}
        {graph.nodes.map(n => { const p = layout.positions.get(n.id); if (!p) return null; const hasChildren = graph.nodes.some(c => c.parentId === n.id), hidden = view.collapsedIds.includes(n.id);
          return <g key={n.id} data-node transform={`translate(${p.x},${p.y - 26})`}>
            <g role="button" tabIndex={0} aria-label={`节点 ${n.title}`} aria-pressed={selected === n.id} className={`${styles.node} ${selected === n.id ? styles.selectedNode : ''} ${n.id === graph.rootId ? styles.rootNode : ''}`} onClick={() => onSelect(n.id)} onDoubleClick={() => { onSelect(n.id); onEdit(); }} onKeyDown={e => { if (e.key === ' ' || (e.key === 'Enter' && selected !== n.id)) { e.preventDefault(); e.stopPropagation(); onSelect(n.id); } }}>
              <rect width="180" height="52" rx="9" /><text x="12" y={n.title.length > 11 ? 22 : 31}>{n.title.slice(0, 11)}</text>{n.title.length > 11 && <text x="12" y="40">{n.title.slice(11, 21)}{n.title.length > 21 ? '…' : ''}</text>}<title>{n.title}{n.isSupplement ? ' · AI 补充' : ''}</title>
              {n.isSupplement && <circle cx="164" cy="10" r="3" className={styles.supplementDot} />}
            </g>
            {hasChildren && <g role="button" tabIndex={0} aria-label={`${hidden ? '展开' : '折叠'} ${n.title}`} onClick={() => toggle(n.id)} onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); toggle(n.id); } }} className={styles.collapse}><circle cx="191" cy="26" r="10"/><text x="191" y="31" textAnchor="middle">{hidden ? '+' : '−'}</text><title>{hidden ? `展开 ${descendants(graph, n.id).size - 1} 个后代` : '折叠分支'}</title></g>}
          </g>;
        })}
      </g>
    </svg>}
    <div className={styles.canvasTools}><IconButton icon={Undo2} label="撤销 · Ctrl Z" disabled={!canUndo} onClick={onUndo}/><IconButton icon={Redo2} label="重做 · Ctrl Shift Z" disabled={!canRedo} onClick={onRedo}/><IconButton icon={Minus} label="缩小" onClick={() => zoom(.85)}/><span>{Math.round(view.zoom * 100)}%</span><IconButton icon={Plus} label="放大" onClick={() => zoom(1.15)}/><IconButton icon={Scan} label="适应画布" onClick={center}/><Button variant="ghost" onClick={() => { onView({ ...view, collapsedIds: [], x: 30, y: 70, zoom: 1 }); }}>回到中心</Button><IconButton icon={ListTree} label={outline ? '画布视图' : '大纲视图'} onClick={() => setOutline(!outline)}/><IconButton icon={Keyboard} label="快捷键帮助" onClick={onHelp}/></div>
    <span className={styles.canvasMeta}>{graph.nodes.length} 个节点 · {graph.relations.length} 处关联</span>
  </div>;
}
