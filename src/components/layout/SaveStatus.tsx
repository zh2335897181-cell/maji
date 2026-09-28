import clsx from 'clsx';
import { CircleCheck, CircleAlert, LoaderCircle } from 'lucide-react';
import type { ReactElement } from 'react';
import { useLibrary } from '../../app/LibraryProvider';
import { formatSavedAt } from '../../lib/format';
import styles from './TopBar.module.css';

/**
 * 保存状态指示器。
 * 编辑页顶部的“正在保存 / 已保存 / 有未保存的修改 / 保存失败”都由这里呈现，
 * 状态本身由 useNoteDraft 驱动，避免各页面各写一套。
 */
export function SaveStatus(): ReactElement | null {
  const { saveState, setSaveState } = useLibrary();
  const { status, savedAt, error } = saveState;

  if (status === 'idle') return null;

  if (status === 'saving') {
    return (
      <span className={clsx(styles.saveStatus, styles.saving)} role="status" data-testid="save-status">
        <LoaderCircle size={13} className={styles.spin} aria-hidden />
        正在保存…
      </span>
    );
  }

  if (status === 'dirty') {
    return (
      <span className={clsx(styles.saveStatus, styles.dirty)} role="status" data-testid="save-status">
        <span
          aria-hidden
          style={{
            width: 6,
            height: 6,
            borderRadius: 'var(--radius-full)',
            background: 'var(--warning-500)',
          }}
        />
        有未保存的修改
      </span>
    );
  }

  if (status === 'error') {
    return (
      <button
        type="button"
        className={clsx(styles.saveStatus, styles.error, styles.saveStatusButton)}
        onClick={() => setSaveState({ status: 'dirty', error: null })}
        title={error ?? '保存失败'}
        data-testid="save-status"
      >
        <CircleAlert size={13} aria-hidden />
        保存失败，点击重试
      </button>
    );
  }

  return (
    <span
      className={clsx(styles.saveStatus, styles.saved)}
      role="status"
      title={savedAt ? formatSavedAt(savedAt) : undefined}
      data-testid="save-status"
    >
      <CircleCheck size={13} aria-hidden />
      已保存
    </span>
  );
}
