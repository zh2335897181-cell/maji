import { useEffect, useRef, useState } from 'react';
import { Maximize2, Pause, Play, X } from 'lucide-react';
import type { ClassroomFloatingSnapshot } from '../../lib/classroom';
import styles from './floating.module.css';

const time = (seconds: number) =>
  `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;

export function ClassroomFloating() {
  const [data, setData] = useState<ClassroomFloatingSnapshot>({ title: '课堂知识点', state: 'starting' });
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);

  useEffect(() => {
    let mounted = true;
    let pending = false;
    const poll = async () => {
      if (pending || !window.maji?.classroom) return;
      pending = true;
      try {
        const next = await window.maji.classroom.floating();
        if (mounted) {
          setData(next);
          setError('');
        }
      } catch {
        if (mounted) setError('暂时无法读取知识点');
      } finally {
        pending = false;
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 1200);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  const paused = data.state === 'paused';
  const canToggle = ['recording', 'importing', 'paused'].includes(data.state);
  const label = data.state === 'pausing' ? '正在暂停'
    : data.state === 'resuming' ? '正在继续'
      : data.state === 'idle' ? '转录已结束'
        : data.state === 'stopping' ? '正在结束'
          : data.state === 'starting' ? '正在准备' : paused ? '继续转录' : '暂停转录';
  const Icon = paused ? Play : Pause;

  async function toggleTranscription() {
    const api = window.maji?.classroom;
    if (!api || locked.current || !canToggle) return;
    locked.current = true;
    setBusy(true);
    setActionError('');
    try {
      if (paused) await api.resume();
      else await api.pause();
      setData(await api.floating());
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : '转录操作失败，请重试');
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  return (
    <section className={styles.window}>
      <header className={styles.header}>
        <strong title={data.title}>课堂知识点</strong>
        <button aria-label="恢复主窗口" onClick={() => void window.maji?.classroom?.restoreMain()}><Maximize2 size={15} /></button>
        <button aria-label="隐藏悬浮窗" onClick={() => void window.maji?.classroom?.hideFloating()}><X size={16} /></button>
      </header>
      <div className={styles.content}>
        {error ? <p>{error}</p> : data.summary ? <>
          <small>{time(data.summary.start)}–{time(data.summary.end)}{paused ? ' · 已暂停' : ''}</small>
          <p className={styles.points}>{data.summary.text}</p>
        </> : <p>等待首段知识点…<br />每两分钟生成后自动替换。</p>}
        {actionError && <p role="alert">{actionError}</p>}
      </div>
      <footer className={styles.controls}>
        <button disabled={busy || !canToggle || !window.maji?.classroom} onClick={() => void toggleTranscription()}>
          <Icon size={15} aria-hidden />{label}
        </button>
      </footer>
    </section>
  );
}
