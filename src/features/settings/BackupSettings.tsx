import { useEffect, useState } from 'react';
import type { BackupPreview, BackupStatus } from '../../lib/backup';
import { Button } from '../../components/ui/Button';
import styles from './BackupSettings.module.css';

const labels: Record<string, string> = { courses: '课程', notes: '笔记', snippets: '代码片段', exercises: '练习', review_items: '复习项目', review_sessions: '复习记录', review_questions: '复习题目', mind_maps: '思维导图', mind_map_views: '导图视图', morning_notes: '晨考' };
const date = (value: string) => new Date(value).toLocaleString('zh-CN');

export function BackupSettings() {
  const api = window.maji?.backup;
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [preview, setPreview] = useState<BackupPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => { if (api) void api.status().then(setStatus).catch(e => setError(String(e instanceof Error ? e.message : e))); }, [api]);
  async function run(action: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('');
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : '操作失败，请重试'); }
    finally { setBusy(false); }
  }
  return <section className={styles.section} aria-label="数据与备份">
    <h3>数据与备份</h3>
    {!api ? <p>备份和恢复仅在桌面版中可用。</p> : <>
      <p>备份包含课程、笔记、代码片段、练习、复习记录、思维导图及晨考。不包含 API 密钥和设备设置。外部图片链接不会下载。</p>
      <fieldset disabled={busy} className={styles.controls}>
        <label><input type="checkbox" checked={status?.enabled ?? true} disabled={!status} onChange={e => { const enabled = e.target.checked; void run(async () => setStatus(await api.setEnabled(enabled))); }} /> 启动时自动备份（每天最多一次）</label>
        <p>{status?.lastSuccessAt ? `上次自动备份：${date(status.lastSuccessAt)}` : '尚无成功备份'}</p>
        <p>内容没有变化时跳过。自动备份和恢复前安全备份各保留最近 7 份。</p>
        <div className={styles.actions}>
          <Button onClick={() => void run(async () => { const result = await api.export(); if (result.saved) setNotice('备份已导出'); })}>导出备份</Button>
          <Button onClick={() => void run(async () => setPreview(await api.preview()))}>从文件恢复</Button>
          <Button onClick={() => void run(() => api.openDirectory())}>打开备份目录</Button>
        </div>
        {preview && <div className={styles.preview}>
          <strong>恢复预览</strong>
          <p>备份时间：{date(preview.createdAt)} · 来源版本：{preview.appVersion}</p>
          <div className={styles.counts}>{Object.entries(preview.counts).map(([key, count]) => <span key={key}>{labels[key] ?? key}：{count}</span>)}</div>
          <p>恢复将整体替换当前学习数据。替换前会先保存安全备份，失败时不会执行恢复。设备设置和密钥保留。</p>
          <div className={styles.actions}>
            <Button variant="danger" onClick={() => void run(async () => { await api.restore(preview.token); setNotice('恢复完成，正在重新加载'); })}>确认整体恢复</Button>
            <Button onClick={() => setPreview(null)}>取消恢复</Button>
          </div>
        </div>}
      </fieldset>
      {status?.files.length ? <details><summary>本机备份记录（{status.files.length}）</summary><ul>{status.files.map(file => <li key={file.name}>{date(file.createdAt)} · {file.kind === 'auto' ? '自动备份' : '恢复前安全备份'}</li>)}</ul></details> : null}
      {(error || status?.error) && <p role="alert">{error || status?.error}</p>}
      {notice && <p role="status">{notice}</p>}
      {busy && <p role="status">正在处理，请稍候…</p>}
    </>}
  </section>;
}
