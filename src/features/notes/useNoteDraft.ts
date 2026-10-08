/* =============================================================================
   码迹 · 笔记草稿与保存状态机
   -----------------------------------------------------------------------------
   职责：
     · 按 id 读取笔记正文（正文不进入全局缓存）
     · 收集编辑过程中的改动，按用户设置的延迟自动保存
     · 把“有未保存的修改 / 正在保存 / 已保存 / 保存失败”同步到顶部状态
   关闭窗口、切换笔记、按 Ctrl+S 都会立即落盘，避免丢内容。
   ============================================================================= */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLibrary } from '../../app/LibraryProvider';
import type { Note, NotePatch } from '../../lib/types';

export interface NoteDraftState {
  note: Note | null;
  loading: boolean;
  missing: boolean;
  title: string;
  tags: string[];
  favorite: boolean;
  /** 首次加载的正文 JSON，用于初始化编辑器；之后由编辑器自己维护 */
  initialContent: string | null;
  setTitle(value: string): void;
  setTags(tags: string[]): void;
  toggleFavorite(): Promise<void>;
  handleEditorChange(json: string, plainText: string): void;
  saveNow(): Promise<boolean>;
}

export function useNoteDraft(noteId: string | undefined): NoteDraftState {
  const { loadNote, updateNote, touchNote, setSaveState, settings } = useLibrary();

  const [note, setNote] = useState<Note | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [title, setTitleState] = useState('');
  const [tags, setTagsState] = useState<string[]>([]);
  const [favorite, setFavorite] = useState(false);
  const [initialContent, setInitialContent] = useState<string | null>(null);

  const pendingRef = useRef<Map<string, NotePatch>>(new Map());
  const flushInFlightRef = useRef<Promise<boolean> | null>(null);
  const timerRef = useRef<number | null>(null);
  const delayRef = useRef(settings.autoSaveDelayMs);
  delayRef.current = settings.autoSaveDelayMs;

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  /** 把累积的改动写入本地数据源 */
  const flush = useCallback(async (): Promise<boolean> => {
    clearTimer();
    while (true) {
      const inFlight = flushInFlightRef.current;
      if (inFlight) {
        if (!(await inFlight)) return false;
        if (flushInFlightRef.current === inFlight) flushInFlightRef.current = null;
        continue;
      }

      const next = pendingRef.current.entries().next();
      if (next.done) return true;
      const [pendingNoteId, pendingPatch] = next.value;
      pendingRef.current.delete(pendingNoteId);
      setSaveState({ status: 'saving' });

      const operation = (async (): Promise<boolean> => {
        try {
          const saved = await updateNote(pendingNoteId, pendingPatch);
          setSaveState({ status: 'saved', savedAt: saved.updatedAt, error: null });
          return true;
        } catch (cause) {
          // 保留失败补丁，并优先保留同一笔记更新一些的输入。
          const newerPatch = pendingRef.current.get(pendingNoteId);
          pendingRef.current.set(pendingNoteId, { ...pendingPatch, ...(newerPatch ?? {}) });
          setSaveState({
            status: 'error',
            error: cause instanceof Error ? cause.message : '写入本地数据失败',
          });
          return false;
        }
      })();
      flushInFlightRef.current = operation;
      const succeeded = await operation;
      if (flushInFlightRef.current === operation) flushInFlightRef.current = null;
      if (!succeeded) return false;
    }
  }, [clearTimer, setSaveState, updateNote]);

  /** 记录改动并安排一次延迟保存 */
  const queueSave = useCallback(
    (patch: NotePatch, immediate = false) => {
      if (!noteId) return;
      const current = pendingRef.current.get(noteId);
      pendingRef.current.set(noteId, { ...(current ?? {}), ...patch });
      setSaveState({ status: 'dirty' });
      clearTimer();
      if (immediate) {
        void flush();
        return;
      }
      timerRef.current = window.setTimeout(() => void flush(), delayRef.current);
    },
    [clearTimer, flush, noteId, setSaveState],
  );

  // 切换笔记：先落盘上一篇，再读取新的一篇
  useEffect(() => {
    let cancelled = false;
    void flush(); // 上一篇的未保存改动
    setLoading(true);
    setMissing(false);
    setInitialContent(null);
    setNote(null);

    if (!noteId) {
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    void loadNote(noteId)
      .then((loaded) => {
        if (cancelled) return;
        if (!loaded) {
          setMissing(true);
          setLoading(false);
          return;
        }
        setNote(loaded);
        setTitleState(loaded.title);
        setTagsState(loaded.tags);
        setFavorite(loaded.favorite);
        setInitialContent(loaded.contentJson);
        setLoading(false);
        setSaveState({ status: 'idle', savedAt: null, error: null });
        void touchNote(loaded.id);
      })
      .catch(() => {
        if (!cancelled) {
          setMissing(true);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
    // flush 依赖回调稳定，切换 id 时只应触发一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

  // 离开编辑页或关闭窗口前落盘
  useEffect(() => {
    const onBeforeUnload = (): void => {
      void flush();
    };
    const onSaveShortcut = (): void => {
      void flush();
    };
    const unregisterCloseHandler = window.maji?.app.onPrepareClose(async () => {
      if (!(await flush())) throw new Error('笔记尚未保存成功，请返回编辑并重试。');
    });
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('maji:save', onSaveShortcut);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('maji:save', onSaveShortcut);
      // Keep the close handshake registered until a route-unmount flush settles.
      void flush().finally(() => unregisterCloseHandler?.());
    };
  }, [flush]);

  const setTitle = useCallback(
    (value: string) => {
      setTitleState(value);
      queueSave({ title: value });
    },
    [queueSave],
  );

  const setTags = useCallback(
    (next: string[]) => {
      setTagsState(next);
      queueSave({ tags: next }, true);
    },
    [queueSave],
  );

  const toggleFavorite = useCallback(async () => {
    if (!noteId) return;
    const next = !favorite;
    setFavorite(next);
    try {
      await updateNote(noteId, { favorite: next });
      setSaveState({ status: 'saved', savedAt: new Date().toISOString(), error: null });
    } catch {
      setFavorite(!next);
    }
  }, [favorite, noteId, setSaveState, updateNote]);

  const handleEditorChange = useCallback(
    (json: string, plainText: string) => {
      // 摘要由数据层统一从正文派生（noteExcerpt），这里只提交正文
      queueSave({
        contentJson: json,
        contentText: plainText,
      });
    },
    [queueSave],
  );

  const saveNow = useCallback(async () => {
    return await flush();
  }, [flush]);

  return {
    note,
    loading,
    missing,
    title,
    tags,
    favorite,
    initialContent,
    setTitle,
    setTags,
    toggleFavorite,
    handleEditorChange,
    saveNow,
  };
}
