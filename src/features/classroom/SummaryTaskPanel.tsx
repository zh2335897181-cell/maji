import { useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button';
import type { SummaryProgress } from '../../lib/summaryTask';
import styles from './classroom.module.css';

export function SummaryTaskPanel({ id, onResume }: { id: string; onResume(): Promise<void> }) {
  const api = window.maji?.classroom;
  const [task, setTask] = useState<SummaryProgress | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [analysis, setAnalysis] = useState('');
  useEffect(() => {
    if (!api?.finalTask) return;
    let alive = true, pending = false;
    const poll = async () => {
      if (pending) return;
      pending = true;
      try { const next = await api.finalTask(id); if (alive) setTask(next); }
      catch (cause) { if (alive) setError(cause instanceof Error ? cause.message : String(cause)); }
      finally { pending = false; }
    };
    void poll();
    const timer = setInterval(() => void poll(), 1000);
    return () => { alive = false; clearInterval(timer); };
  }, [api, id]);
  async function run(action: () => Promise<unknown>) {
    setBusy(true); setError('');
    try { await action(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }
  if (!task) return error ? <p role="alert">{error}</p> : null;
  return <section className={styles.taskPanel} aria-label="总结任务进度">
    <p role="status">{task.stage}{task.file ? ' · ' + task.file : ''}</p>
    {task.totalFiles > 0 && <p>已分析 {task.completedFiles} / {task.totalFiles} 个文件</p>}
    {task.state === 'running' && <Button variant="secondary" disabled={busy}
      onClick={() => void run(() => api!.cancelFinal(id))}>取消总结任务</Button>}
    {(task.state === 'paused' || task.state === 'error') && <Button variant="secondary" disabled={busy}
      onClick={() => void run(onResume)}>继续上次总结</Button>}
    {task.message && <p>{task.message}</p>}
    {!!task.analyses?.length && <details><summary>查看已保存的文件分析</summary>
      <select aria-label="查看文件分析" defaultValue="" onChange={event => {
        const path = event.target.value;
        if (path) void run(async () => setAnalysis((await api!.finalAnalysis(id, path)).text));
      }}>
        <option value="">选择文件</option>
        {task.analyses.map(path => <option key={path}>{path}</option>)}
      </select>
      <pre className={styles.taskAnalysis}>{analysis}</pre>
    </details>}
    {error && <p className={styles.error} role="alert">{error}</p>}
  </section>;
}
