import { useCallback, useEffect, useRef, useState } from 'react';
import { validateMorningInput, type MorningApi, type MorningInput, type MorningNote } from '../../lib/morningNotes';

const key = (id: string) => `maji:morning-draft:${id}`;
export function useMorningDraft(api: MorningApi, onSaved: (note: MorningNote) => void, delay = 700) {
  const [note, setNote] = useState<MorningNote | null>(null), [initialContent, setInitialContent] = useState('');
  const [status, setStatus] = useState('已保存'), [error, setError] = useState('');
  const current = useRef<MorningNote | null>(null), dirty = useRef(false), stamp = useRef(0), openToken = useRef(0);
  const saving = useRef<Promise<boolean> | null>(null), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const savedCallback = useRef(onSaved); savedCallback.current = onSaved;
  const delayRef = useRef(delay); delayRef.current = delay;
  const recover = useCallback((value: MorningNote) => {
    try { localStorage.setItem(key(value.id), JSON.stringify(value)); }
    catch { setError('本机草稿备份失败，请立即保存，并检查存储空间'); }
  }, []);
  const save = useCallback(async (): Promise<boolean> => {
    clearTimeout(timer.current);
    if (saving.current) return saving.current;
    const operation = async () => {
      while (dirty.current && current.current) {
        const snapshot = current.current, version = stamp.current;
        setStatus('保存中');
        try {
          const input = validateMorningInput(snapshot);
          const saved = await api.update(snapshot.id, input, snapshot.revision);
          if (current.current?.id !== snapshot.id) return false;
          current.current = stamp.current === version ? saved : { ...current.current, revision: saved.revision, updatedAt: saved.updatedAt };
          dirty.current = stamp.current !== version;
          setNote(current.current); savedCallback.current(saved);
          if (dirty.current) recover(current.current);
          else { try { localStorage.removeItem(key(saved.id)); } catch { /* Stored data is already safe. */ } }
          setError('');
        } catch (cause) {
          setStatus('保存失败'); setError(cause instanceof Error ? cause.message : '晨考保存失败，请重试');
          if (current.current) recover(current.current);
          return false;
        }
      }
      setStatus('已保存'); return true;
    };
    const flight = operation(); saving.current = flight;
    try { return await flight; } finally { if (saving.current === flight) saving.current = null; }
  }, [api, recover]);
  const open = useCallback(async (next: MorningNote): Promise<boolean> => {
    const token = ++openToken.current;
    if (current.current?.id === next.id) return true;
    if (!(await save()) || token !== openToken.current) return false;
    let restored = next, hasDraft = false;
    try {
      const raw = localStorage.getItem(key(next.id));
      if (raw) {
        const draft = JSON.parse(raw) as MorningNote;
        if (draft.id !== next.id || !Number.isSafeInteger(draft.revision) || draft.revision < 1
          || typeof draft.title !== 'string' || draft.title.length > 200 || typeof draft.date !== 'string' || draft.date.length > 10) throw new Error('晨考草稿标识无效');
        validateMorningInput({ ...draft, title: next.title, date: next.date });
        // Keep the old revision: a stale recovery can be viewed/copied, but must not overwrite newer stored data.
        restored = draft; hasDraft = true;
      }
    } catch { setError('本机草稿无法恢复，已打开保存的内容'); }
    current.current = restored; dirty.current = hasDraft; stamp.current++;
    setNote(restored); setInitialContent(restored.contentJson); setStatus(hasDraft ? '已恢复未保存草稿' : '已保存');
    return true;
  }, [save]);
  const edit = useCallback((patch: Partial<MorningInput>) => {
    if (!current.current) return;
    if (Object.entries(patch).every(([field, value]) => current.current?.[field as keyof MorningInput] === value)) return;
    current.current = { ...current.current, ...patch }; dirty.current = true; stamp.current++;
    setNote(current.current); setStatus('有未保存的修改'); setError(''); recover(current.current);
    clearTimeout(timer.current); timer.current = setTimeout(() => void save(), delayRef.current);
  }, [recover, save]);
  useEffect(() => {
    const flush = () => { void save(); };
    const unregister = window.maji?.app?.onPrepareClose(async () => {
      if (!(await save())) throw new Error('晨考内容尚未保存成功，请重试保存后再关闭');
    });
    window.addEventListener('maji:save', flush); window.addEventListener('beforeunload', flush);
    return () => {
      clearTimeout(timer.current); window.removeEventListener('maji:save', flush); window.removeEventListener('beforeunload', flush);
      void save().finally(() => unregister?.());
    };
  }, [save]);
  return { note, initialContent, status, error, open, edit, save };
}
