import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './Button';
import styles from './overlay.module.css';

export interface ModalProps {
  open: boolean;
  onClose(): void;
  title: string;
  description?: ReactNode;
  icon?: LucideIcon;
  tone?: 'default' | 'danger';
  /** 主体内容（表单等） */
  children?: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}

/**
 * 模态框：Esc 关闭、点击遮罩关闭、打开时把焦点移进来并在关闭后还原。
 * 打开期间 Tab 被限制在对话框内部。
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  icon: Icon,
  tone = 'default',
  children,
  footer,
  wide,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;

    const focusables = (): HTMLElement[] => {
      const root = dialogRef.current;
      if (!root) return [];
      return Array.from(
        root.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
    };

    const timer = window.setTimeout(() => {
      const [first] = focusables();
      (first ?? dialogRef.current)?.focus();
    }, 0);

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('keydown', onKeyDown, true);
      restoreFocusRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className={styles.scrim}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={clsx(styles.modal, wide && styles.modalWide)}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={dialogRef}
        tabIndex={-1}
      >
        <div className={styles.modalHeader}>
          {Icon ? (
            <span className={clsx(styles.modalIcon, tone === 'danger' && styles.modalIconDanger)}>
              <Icon size={16} aria-hidden />
            </span>
          ) : null}
          <div className={styles.modalTitles}>
            <h2 className={styles.modalTitle}>{title}</h2>
            {description ? <div className={styles.modalDescription}>{description}</div> : null}
          </div>
        </div>
        {children ? <div className={styles.modalBody}>{children}</div> : null}
        {footer ? <div className={styles.modalFooter}>{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
  icon?: LucideIcon;
  /** 需要用户看清的细节，例如将被删除的内容 */
  details?: ReactNode;
  onConfirm(): void;
  onCancel(): void;
  busy?: boolean;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = '确定',
  cancelLabel = '取消',
  tone = 'danger',
  icon,
  details,
  onConfirm,
  onCancel,
  busy,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      description={description}
      icon={icon}
      tone={tone}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            onClick={onConfirm}
            loading={busy}
            data-testid="confirm-action"
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {details}
    </Modal>
  );
}
