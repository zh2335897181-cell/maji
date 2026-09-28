import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import styles from './display.module.css';

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: ReactNode;
  actions?: ReactNode;
  /** 更紧凑的版本，用在侧栏与卡片内部 */
  compact?: boolean;
}

/** 统一的空状态：图标 + 一句解释 + 明确的下一步动作 */
export function EmptyState({ icon: Icon, title, description, actions, compact }: EmptyStateProps) {
  return (
    <div className={styles.emptyState} style={compact ? { padding: 'var(--space-8) var(--space-4)' } : undefined}>
      <span className={styles.emptyIcon}>
        <Icon size={compact ? 18 : 20} aria-hidden />
      </span>
      <span className={styles.emptyTitle}>{title}</span>
      <p className={styles.emptyDescription}>{description}</p>
      {actions ? <div className={styles.emptyActions}>{actions}</div> : null}
    </div>
  );
}
