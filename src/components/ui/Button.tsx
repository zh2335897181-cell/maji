import clsx from 'clsx';
import { LoaderCircle, type LucideIcon } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './controls.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'soft' | 'danger' | 'dangerGhost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  /** 处于选中 / 激活状态（筛选按钮、分段按钮用） */
  selected?: boolean;
  loading?: boolean;
  children?: ReactNode;
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: styles.primary,
  secondary: styles.secondary,
  ghost: styles.ghost,
  soft: styles.soft,
  danger: styles.danger,
  dangerGhost: styles.dangerGhost,
};

const SIZE_CLASS: Record<ButtonSize, string | undefined> = {
  sm: styles.btnSm,
  md: undefined,
  lg: styles.btnLg,
};

const ICON_SIZE: Record<ButtonSize, number> = { sm: 13, md: 15, lg: 16 };

export function Button({
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  iconRight: IconRight,
  selected = false,
  loading = false,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={clsx(
        styles.btn,
        VARIANT_CLASS[variant],
        SIZE_CLASS[size],
        selected && styles.selected,
        className,
      )}
    >
      {loading ? (
        <LoaderCircle size={ICON_SIZE[size]} className={styles.spinner} aria-hidden />
      ) : Icon ? (
        <Icon size={ICON_SIZE[size]} aria-hidden className={styles.btnIcon} />
      ) : null}
      {children}
      {IconRight ? <IconRight size={ICON_SIZE[size]} aria-hidden className={styles.btnIcon} /> : null}
    </button>
  );
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** 无障碍名称，必填：图标按钮没有可见文字 */
  label: string;
  icon: LucideIcon;
  size?: 'sm' | 'md';
  active?: boolean;
  tone?: 'default' | 'danger';
  /** 显示在悬浮提示中的键盘操作提示 */
  shortcut?: string;
}

export function IconButton({
  label,
  icon: Icon,
  size = 'md',
  active = false,
  tone = 'default',
  shortcut,
  className,
  type = 'button',
  ...rest
}: IconButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      aria-label={label}
      title={shortcut ? `${label} · ${shortcut}` : label}
      aria-pressed={active || undefined}
      className={clsx(
        styles.iconBtn,
        size === 'sm' && styles.iconBtnSm,
        active && styles.iconBtnActive,
        tone === 'danger' && styles.iconBtnDanger,
        className,
      )}
    >
      <Icon size={size === 'sm' ? 14 : 16} aria-hidden />
    </button>
  );
}
