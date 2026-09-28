import clsx from 'clsx';
import { X, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type { DueTone } from '../../lib/format';
import styles from './display.module.css';
import { tokenizeQuery, highlightSegments } from '../../lib/text';

export type TagTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'subtle';

const TONE_CLASS: Record<TagTone, string | undefined> = {
  neutral: undefined,
  accent: styles.tagAccent,
  success: styles.tagSuccess,
  warning: styles.tagWarning,
  danger: styles.tagDanger,
  subtle: styles.tagSubtle,
};

export interface TagProps {
  children: ReactNode;
  tone?: TagTone;
  mono?: boolean;
  icon?: LucideIcon;
  onClick?: () => void;
  onRemove?: () => void;
  title?: string;
}

/** 标签：语言、主题标签、复习状态共用同一个组件 */
export function Tag({ children, tone = 'neutral', mono, icon: Icon, onClick, onRemove, title }: TagProps) {
  const content = (
    <>
      {Icon ? <Icon size={12} aria-hidden /> : null}
      {children}
      {onRemove ? (
        <span
          className={styles.tagRemove}
          role="button"
          tabIndex={0}
          aria-label="移除标签"
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              event.stopPropagation();
              onRemove();
            }
          }}
        >
          <X size={11} aria-hidden />
        </span>
      ) : null}
    </>
  );

  const className = clsx(styles.tag, TONE_CLASS[tone], mono && styles.tagMono);

  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick} title={title}>
        {content}
      </button>
    );
  }
  return (
    <span className={className} title={title}>
      {content}
    </span>
  );
}

export function TagRow({ children }: { children: ReactNode }) {
  return <div className={styles.tagRow}>{children}</div>;
}

export function StatusDot({
  tone = 'neutral',
}: {
  tone?: DueTone | 'mastered' | 'none' | 'danger' | 'neutral';
}) {
  const map: Record<string, string> = {
    overdue: styles.dotDue,
    today: styles.dotDue,
    soon: styles.dotSoon,
    later: styles.dotNeutral,
    none: styles.dotNeutral,
    neutral: styles.dotNeutral,
    mastered: styles.dotMastered,
    danger: styles.dotDanger,
  };
  return <span className={clsx(styles.statusDot, map[tone] ?? styles.dotNeutral)} aria-hidden />;
}

/** 搜索结果高亮：结构化渲染，不拼接 HTML */
export function HighlightedText({ text, query }: { text: string; query: string }) {
  const segments = highlightSegments(text, tokenizeQuery(query));
  return (
    <>
      {segments.map((segment, index) =>
        segment.hit ? (
          <mark className={styles.highlight} key={`${segment.text}-${index}`}>
            {segment.text}
          </mark>
        ) : (
          <span key={`${segment.text}-${index}`}>{segment.text}</span>
        ),
      )}
    </>
  );
}

export function SectionTitle({
  children,
  count,
  action,
}: {
  children: ReactNode;
  count?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={styles.sectionTitle}>
      <h2 className={styles.sectionTitleText}>
        {children}
        {count !== undefined ? <span className={styles.sectionCount}>{count}</span> : null}
      </h2>
      {action}
    </div>
  );
}

export function MetaRow({ children }: { children: ReactNode }) {
  return <div className={styles.metaRow}>{children}</div>;
}
