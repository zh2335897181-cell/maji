import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import type { ProjectAttachment } from '../../lib/projectAttachments';
import styles from './classroom.module.css';

export function ClassroomSummaryDialog({ title, onClose, onFinalize }: {
  title: string;
  onClose(): void;
  onFinalize(fileIds?: string[]): Promise<void>;
}) {
  const api = window.maji?.projectAttachments;
  const [project, setProject] = useState<ProjectAttachment | null>(null);
  const [selectedIds, setSelectedIds] = useState(new Set<string>());
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function run(task: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await task();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  function choose(kind: 'folder' | 'files') {
    if (!api) return;
    void run(async () => {
      const selected = await api.choose(kind);
      if (!selected) return;
      setProject(selected);
      setSelectedIds(new Set(kind === 'files' ? selected.files.map(file => file.id) : []));
      setFilter('');
    });
  }

  const filtered = project?.files.filter(file => file.path.toLowerCase().includes(filter.trim().toLowerCase())) ?? [];
  return (
    <Modal open wide title="生成课堂总结" description={title} onClose={() => { if (!busy) onClose(); }}
      footer={<>
        <Button variant="secondary" disabled={busy} onClick={() => void run(() => onFinalize())}>仅总结课堂</Button>
        <Button disabled={busy || !selectedIds.size} onClick={() => void run(() => onFinalize([...selectedIds]))}>结合项目总结</Button>
      </>}>
      <div className={styles.form}>
        <p>转写已保存。你可以把完整的代码文件附到总结，让 AI 关联课堂知识和你的实现。</p>
        {api && <div className={styles.actions}>
          <Button variant="secondary" disabled={busy} onClick={() => choose('files')}>上传代码文件</Button>
          <Button variant="secondary" disabled={busy} onClick={() => choose('folder')}>选择项目目录</Button>
        </div>}
        {project && <>
          <p>{project.name} · 已选 {selectedIds.size} 个文件{project.incomplete ? ' · 目录较大，仅列出部分文件' : ''}</p>
          <input aria-label="筛选项目文件" placeholder="筛选文件路径" value={filter} onChange={event => setFilter(event.target.value)} />
          <div className={styles.attachmentFiles} role="group" aria-label="要发送的文件">
            {filtered.map(file => (
              <label key={file.id}>
                <input type="checkbox" checked={selectedIds.has(file.id)} disabled={busy}
                  onChange={event => {
                    const checked = event.target.checked;
                    setSelectedIds(current => {
                      const next = new Set(current);
                      if (checked) next.add(file.id);
                      else next.delete(file.id);
                      return next;
                    });
                  }} />
                {file.path}
              </label>
            ))}
            {!filtered.length && <p>没有匹配的文件。</p>}
          </div>
          <p>点击「结合项目总结」后，所选 UTF-8 文件的完整内容会分批发送到你配置的 AI 服务。单文件没有应用大小上限。</p>
        </>}
        {busy && <p role="status">正在处理，文件越大，用时可能越长…</p>}
        {error && <p className={styles.error} role="alert">{error}</p>}
      </div>
    </Modal>
  );
}
