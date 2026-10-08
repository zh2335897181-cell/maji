import { useCallback, useEffect, useRef, useState } from 'react';
import { validateDraft, type MindMap, type MindMapApi, type MindMapDraft } from '../../lib/mindmap';

const recoveryKey = (id: string) => `maji:mindmap-recovery:${id || 'preview'}`;
export function useMindMapEditor(api: MindMapApi, onSaved: (map: MindMap) => void) {
  const [map, setMap] = useState<MindMap | null>(null), [state, setState] = useState(''), [error, setError] = useState('');
  const current = useRef<MindMap | null>(null), pending = useRef(false), flight = useRef<Promise<boolean> | null>(null), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const version = useRef(0), documentToken = useRef(0), history = useRef<MindMap[]>([]), future = useRef<MindMap[]>([]), mounted = useRef(true), notify = useRef(onSaved);
  notify.current = onSaved;
  const publish = (next: MindMap) => { current.current = next; if (mounted.current) setMap(next); };
  const save = useCallback(async (asNew = false): Promise<boolean> => {
    if (flight.current) { if (!(await flight.current)) return false; }
    const run = async (): Promise<boolean> => {
      while (current.current && (pending.current || asNew)) {
        const snapshot = current.current, stamp = version.current, token = documentToken.current; const oldKey = recoveryKey(snapshot.id);
        if (mounted.current) { setState('保存中…'); setError(''); }
        try {
          const saved = await api.save(snapshot, asNew ? undefined : snapshot.id || undefined, asNew ? undefined : snapshot.revision);
          if (documentToken.current !== token) { notify.current(saved); return true; }
          if (current.current === snapshot || version.current === stamp) { publish(saved); pending.current = false; }
          else if (current.current?.id === snapshot.id) publish({ ...current.current, id: saved.id, revision: saved.revision, createdAt: saved.createdAt, updatedAt: saved.updatedAt });
          if (!pending.current) localStorage.removeItem(oldKey);
          else if (current.current) { const newKey = recoveryKey(current.current.id); localStorage.setItem(newKey, JSON.stringify(current.current)); if (newKey !== oldKey) localStorage.removeItem(oldKey); }
          notify.current(saved); asNew = false;
          if (mounted.current) setState('已保存到本机');
        } catch (cause) {
          if (mounted.current) { setState('保存失败'); setError(cause instanceof Error ? cause.message : '保存失败，请重试'); }
          return false;
        }
      }
      return true;
    };
    const task = run(); flight.current = task;
    try { return await task; } finally { if (flight.current === task) flight.current = null; }
  }, [api]);
  const open = async (next: MindMap, restore = true) => {
    if (next.id && current.current?.id === next.id) return true;
    if (flight.current && !(await flight.current)) return false;
    if (current.current?.id && pending.current && !(await save())) return false;
    clearTimeout(timer.current); history.current = []; future.current = []; pending.current = !next.id; version.current++; documentToken.current++;
    let loaded = next;
    if (restore) {
      try {
        const raw = localStorage.getItem(recoveryKey(next.id));
        if (raw) { const recovered = JSON.parse(raw) as MindMap; loaded = { ...next, ...validateDraft(recovered), ...(recovered.revision !== next.revision ? { id: '', revision: 0 } : {}) }; pending.current = true; setError('已恢复未保存的草稿，请检查后保存。'); }
        else setError('');
      } catch { setError('草稿恢复失败，已打开最近保存的导图'); }
    } else setError('');
    publish(loaded);
    if (!loaded.id) { try { localStorage.setItem(recoveryKey(''), JSON.stringify(loaded)); } catch { setError('恢复草稿存储失败，请立即保存'); } }
    setState(pending.current ? '草稿待保存' : loaded.id ? '已保存到本机' : '生成预览 · 尚未保存'); return true;
  };
  const edit = (draft: MindMapDraft, record = true) => {
    const previous = current.current; if (!previous) return;
    try {
      const next = { ...previous, ...validateDraft(draft) };
      if (record) { history.current.push(previous); if (history.current.length > 80) history.current.shift(); future.current = []; }
      version.current++; pending.current = true; publish(next); setError(''); setState(next.id ? '待保存' : '生成预览 · 尚未保存');
      try { localStorage.setItem(recoveryKey(next.id), JSON.stringify(next)); } catch { setError('恢复草稿存储失败，请立即保存导图'); }
      clearTimeout(timer.current); if (next.id) timer.current = setTimeout(() => void save(), 700);
      return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : '修改无效'); return false; }
  };
  const undo = () => { const prior = history.current.pop(); if (prior && current.current) { future.current.push(current.current); edit(prior, false); } };
  const redo = () => { const next = future.current.pop(); if (next && current.current) { history.current.push(current.current); edit(next, false); } };
  useEffect(() => {
    mounted.current = true;
    const close = window.maji?.app?.onPrepareClose(async () => { if (current.current?.id && !(await save())) throw new Error('思维导图保存失败，请重试或另存草稿'); });
    const shortcut = () => { if (current.current && !current.current.id) pending.current = true; void save(); };
    const unload = () => { if (current.current?.id) void save(); };
    window.addEventListener('maji:save', shortcut); window.addEventListener('beforeunload', unload);
    return () => { mounted.current = false; clearTimeout(timer.current); window.removeEventListener('maji:save', shortcut); window.removeEventListener('beforeunload', unload); void (current.current?.id ? save() : Promise.resolve(true)).finally(() => close?.()); };
  }, [save]);
  return { map, state, error, setError, open, edit, save, undo, redo, canUndo: history.current.length > 0, canRedo: future.current.length > 0, current, version,
    clear: () => { clearTimeout(timer.current); documentToken.current++; current.current = null; pending.current = false; history.current = []; future.current = []; setMap(null); setState(''); setError(''); },
    savePreview: async () => { pending.current = true; return save(); },
  };
}
