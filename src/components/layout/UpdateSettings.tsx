import { RefreshCw, RotateCcw } from 'lucide-react';
import type { ReactElement } from 'react';
import type { UpdateStatus } from '../../lib/ipc';
import { Button } from '../ui/Button';
import styles from './UpdateSettings.module.css';

export interface UpdateSettingsProps {
  status: UpdateStatus;
  onCheck(): void;
  onInstall(): void;
}

function statusText(status: UpdateStatus): string {
  switch (status.state) {
    case 'unsupported': return status.message;
    case 'idle': return '尚未检查更新。';
    case 'checking': return '正在检查更新…';
    case 'latest': return '你正在使用最新版本。';
    case 'available': return `发现新版本 ${status.version}，正在准备下载…`;
    case 'downloading': return `正在下载 ${status.version}…`;
    case 'downloaded': return `新版本 ${status.version} 已下载完成。`;
    case 'error': return status.message;
  }
}

export function UpdateSettings({ status, onCheck, onInstall }: UpdateSettingsProps): ReactElement {
  const busy = status.state === 'checking' || status.state === 'available' || status.state === 'downloading';
  const unsupported = status.state === 'unsupported';
  return (
    <section className={styles.section} aria-labelledby="update-settings-title">
      <div className={styles.heading}>
        <div>
          <h3 id="update-settings-title">应用更新</h3>
          <p>当前版本 {status.currentVersion}</p>
        </div>
        <Button variant="secondary" onClick={onCheck} disabled={busy || unsupported}>
          <RefreshCw size={14} aria-hidden /> 检查更新
        </Button>
      </div>
      <p className={styles.status} role="status">{statusText(status)}</p>
      {status.state === 'downloading' ? (
        <div className={styles.progress}>
          <progress aria-label="更新下载进度" max={100} value={status.percent} />
          <span>{Math.round(status.percent)}%</span>
        </div>
      ) : null}
      {status.state === 'downloaded' ? (
        <div className={styles.installRow}>
          <span>重启应用后完成安装。</span>
          <Button onClick={onInstall}><RotateCcw size={14} aria-hidden /> 立即重启并安装</Button>
        </div>
      ) : null}
    </section>
  );
}
