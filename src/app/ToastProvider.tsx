import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import styles from '../components/ui/overlay.module.css';

export type ToastTone = 'success' | 'info' | 'warning' | 'error';

export interface ToastOptions {
  message: string;
  tone?: ToastTone;
  /** 可选的撤销 / 查看动作 */
  action?: { label: string; onClick: () => void };
  durationMs?: number;
}

interface ToastRecord extends ToastOptions {
  id: number;
  tone: ToastTone;
}

interface ToastContextValue {
  show(options: ToastOptions | string): void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_ICON = {
  success: CircleCheck,
  info: Info,
  warning: CircleAlert,
  error: CircleAlert,
} as const;

export function ToastProvider({ children }: { children: ReactNode }): ReactNode {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const counter = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback(
    (options: ToastOptions | string) => {
      const resolved: ToastOptions = typeof options === 'string' ? { message: options } : options;
      counter.current += 1;
      const record: ToastRecord = {
        ...resolved,
        id: counter.current,
        tone: resolved.tone ?? 'success',
      };
      setToasts((current) => [...current.slice(-2), record]);
      const duration = resolved.durationMs ?? (resolved.action ? 6000 : 3200);
      window.setTimeout(() => dismiss(record.id), duration);
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className={styles.toastRegion} role="status" aria-live="polite">
        {toasts.map((toast) => {
          const Icon = TONE_ICON[toast.tone];
          return (
            <div key={toast.id} className={styles.toast} data-tone={toast.tone}>
              <Icon size={16} aria-hidden className={styles.toastIcon} />
              <span className={styles.toastMessage}>{toast.message}</span>
              {toast.action ? (
                <button
                  type="button"
                  className={styles.toastAction}
                  onClick={() => {
                    toast.action?.onClick();
                    dismiss(toast.id);
                  }}
                >
                  {toast.action.label}
                </button>
              ) : null}
              <button
                type="button"
                className={styles.toastClose}
                aria-label="关闭提示"
                onClick={() => dismiss(toast.id)}
              >
                <X size={14} aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast 必须在 ToastProvider 内使用');
  return context;
}
