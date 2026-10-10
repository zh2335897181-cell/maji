import clsx from 'clsx';
import { Check, type LucideIcon } from 'lucide-react';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import controls from './controls.module.css';
import styles from './overlay.module.css';

export interface MenuAction {
  id: string;
  label: string;
  icon?: LucideIcon;
  hint?: string;
  danger?: boolean;
  disabled?: boolean;
  /** 用于“移动笔记到课程”这类可勾选的菜单 */
  checked?: boolean;
  onSelect(): void;
}

export type MenuEntry = MenuAction | { id: string; separator: true };

export interface MenuProps {
  /** 无障碍名称 */
  label: string;
  icon: LucideIcon;
  /** 提供文字时按钮带文字，否则是纯图标按钮 */
  text?: string;
  items: MenuEntry[];
  align?: 'start' | 'end';
  disabled?: boolean;
}

function isSeparator(entry: MenuEntry): entry is { id: string; separator: true } {
  return 'separator' in entry;
}

/** 下拉菜单：点击展开，点击外部 / Esc 关闭，上下方向键在菜单项之间移动 */
export function Menu({ label, icon: Icon, text, items, align = 'end', disabled = false }: MenuProps) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const [position, setPosition] = useState({ left: 0, top: 0 });

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const anchor = anchorRef.current?.getBoundingClientRect();
      const menu = menuRef.current?.getBoundingClientRect();
      if (!anchor || !menu) return;
      const left = align === 'end' ? anchor.right - menu.width : anchor.left;
      const below = anchor.bottom + 4;
      const top = below + menu.height > window.innerHeight - 8
        ? anchor.top - menu.height - 4 : below;
      setPosition({
        left: Math.max(8, Math.min(left, window.innerWidth - menu.width - 8)),
        top: Math.max(8, Math.min(top, window.innerHeight - menu.height - 8)),
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, align, items]);

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event: MouseEvent): void => {
      if (!anchorRef.current?.contains(event.target as Node) && !menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setOpen(false);
        anchorRef.current?.querySelector('button')?.focus();
        return;
      }
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      const nodes = Array.from(
        menuRef.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? [],
      );
      if (nodes.length === 0) return;
      event.preventDefault();
      const index = nodes.findIndex((node) => node === document.activeElement);
      const next =
        event.key === 'ArrowDown'
          ? nodes[(index + 1 + nodes.length) % nodes.length]
          : nodes[(index - 1 + nodes.length) % nodes.length];
      next?.focus();
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const timer = window.setTimeout(() => {
      menuRef.current?.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  return (
    <div className={styles.menuAnchor} ref={anchorRef}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        aria-label={text ? `${text}（${label}）` : label}
        title={label}
        className={clsx(
          text ? controls.btn : controls.iconBtn,
          text ? controls.ghost : undefined,
          text ? controls.btnSm : undefined,
        )}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <Icon size={text ? 14 : 16} aria-hidden />
        {text}
      </button>
      {open ? createPortal(
        <div
          className={styles.menu}
          style={{ position: 'fixed', left: position.left, top: position.top, maxWidth: 'calc(100vw - 16px)', maxHeight: 'calc(100vh - 16px)', overflowY: 'auto' }}
          role="menu"
          id={menuId}
          aria-label={label}
          ref={menuRef}
        >
          {items.map((entry) =>
            isSeparator(entry) ? (
              <div key={entry.id} className={styles.menuSeparator} role="separator" />
            ) : (
              <button
                key={entry.id}
                type="button"
                role="menuitem"
                disabled={entry.disabled}
                className={clsx(
                  styles.menuItem,
                  entry.danger && styles.menuItemDanger,
                  entry.checked && styles.menuItemActive,
                )}
                onClick={() => {
                  setOpen(false);
                  entry.onSelect();
                }}
              >
                {entry.checked ? (
                  <Check size={14} aria-hidden />
                ) : entry.icon ? (
                  <entry.icon size={14} aria-hidden />
                ) : (
                  <span style={{ width: 14 }} aria-hidden />
                )}
                {entry.label}
                {entry.hint ? <span className={styles.menuItemHint}>{entry.hint}</span> : null}
              </button>
            ),
          )}
        </div>, document.body,
      ) : null}
    </div>
  );
}
