import { useCallback, useEffect, useRef, useState } from 'react';
import { validateExam, type ExamApi, type ExamRecord } from '../../lib/exams';
/** Serialized saves use the latest revision; keystrokes during a save are preserved. */
export function useExamDraft(api: ExamApi) {
  const [draft, setDraft] = useState<ExamRecord | null>(null),
    [status, setStatus] = useState('已保存'),
    [error, setError] = useState('');
  const current = useRef<ExamRecord | null>(null),
    change = useRef(0),
    savedChange = useRef(0),
    queue = useRef(Promise.resolve()),
    live = useRef(true);
  const cache = (record: ExamRecord) => {
    try {
      localStorage.setItem(`maji:exam-draft:${record.id}`, JSON.stringify(record));
    } catch {
      /* SQLite save and visible errors remain authoritative. */
    }
  };
  const save = useCallback(() => {
    const operation = queue.current
      .catch(() => {})
      .then(async () => {
        if (!current.current || savedChange.current === change.current) return current.current;
        const snapshot = current.current,
          generation = change.current;
        if (live.current) setStatus('保存中…');
        const result = await api.save(snapshot);
        if (current.current?.id === snapshot.id) {
          current.current = {
            ...current.current,
            revision: result.revision,
            updatedAt: result.updatedAt,
          };
          savedChange.current = generation;
          if (change.current === generation) {
            try {
              localStorage.removeItem(`maji:exam-draft:${snapshot.id}`);
            } catch {
              /* Stored record is safe. */
            }
          } else cache(current.current);
          if (live.current) {
            setDraft(current.current);
            setStatus(change.current === generation ? '已保存' : '待保存');
            setError('');
          }
        }
        return result;
      });
    queue.current = operation.then(
      () => {},
      () => {},
    );
    return operation.catch((cause) => {
      if (live.current) {
        setError(cause instanceof Error ? cause.message : '保存失败');
        setStatus('保存失败');
      }
      throw cause;
    });
  }, [api]);
  const open = useCallback(
    async (record: ExamRecord) => {
      await save();
      record =
        current.current?.id === record.id
          ? current.current
          : ((await api.list()).find((e) => e.id === record.id) ?? record);
      let recovered = false;
      try {
        const candidate = validateExam(
          JSON.parse(localStorage.getItem(`maji:exam-draft:${record.id}`) ?? 'null'),
        );
        if (candidate.id === record.id && candidate.revision === record.revision) {
          record = candidate;
          recovered = true;
        }
      } catch {
        /* Invalid recovery data is ignored. */
      }
      current.current = record;
      change.current = recovered ? 1 : 0;
      savedChange.current = record.revision === 0 ? -1 : 0;
      setDraft(record);
      setError('');
      setStatus(recovered || record.revision === 0 ? '待保存' : '已保存');
    },
    [save, api],
  );
  const edit = useCallback((fn: (previous: ExamRecord) => ExamRecord) => {
    if (!current.current) return;
    current.current = fn(current.current);
    change.current++;
    cache(current.current);
    setDraft(current.current);
    setStatus('待保存');
  }, []);
  useEffect(() => {
    if (status !== '待保存') return;
    const timer = setTimeout(() => {
      void save().catch(() => {});
    }, 900);
    return () => clearTimeout(timer);
  }, [draft, status, save]);
  useEffect(() => {
    live.current = true;
    const warn = (e: BeforeUnloadEvent) => {
      if (change.current !== savedChange.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    const flush = () => {
      void save().catch(() => {});
    };
    window.addEventListener('maji:save', flush);
    const unregister = window.maji?.app?.onPrepareClose(async () => {
      await save();
    });
    return () => {
      live.current = false;
      window.removeEventListener('beforeunload', warn);
      window.removeEventListener('maji:save', flush);
      void save()
        .catch(() => {})
        .finally(() => unregister?.());
    };
  }, [save]);
  return { draft, edit, open, save, status, error, getCurrent: () => current.current };
}
