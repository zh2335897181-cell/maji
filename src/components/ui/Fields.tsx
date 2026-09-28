import clsx from 'clsx';
import { CircleAlert, Check, type LucideIcon } from 'lucide-react';
import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import styles from './controls.module.css';

interface FieldShellProps {
  id: string;
  label?: string;
  /** 字段说明：告诉用户这个字段填什么、怎么写 */
  hint?: string;
  example?: string;
  required?: boolean;
  error?: string | null;
  children: ReactNode;
}

/** 统一的“标签 + 说明 + 示例 + 错误”外壳，保证所有表单长得一样 */
function FieldShell({
  id,
  label,
  hint,
  example,
  required,
  error,
  children,
}: FieldShellProps): ReactNode {
  return (
    <div className={styles.field}>
      {label ? (
        <label className={styles.label} htmlFor={id}>
          {label}
          {required ? (
            <span className={styles.required} aria-hidden>
              *
            </span>
          ) : null}
          {hint ? <span className={styles.labelHint}>{hint}</span> : null}
        </label>
      ) : null}
      {children}
      {error ? (
        <span className={styles.errorText} id={`${id}-error`} role="alert">
          <CircleAlert size={13} aria-hidden />
          {error}
        </span>
      ) : example ? (
        <span className={styles.hint}>例如：{example}</span>
      ) : null}
    </div>
  );
}

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  hint?: string;
  example?: string;
  error?: string | null;
  icon?: LucideIcon;
  /** 输入框右侧的动作按钮，例如清空 */
  suffix?: ReactNode;
}

export function TextField({
  label,
  hint,
  example,
  error,
  icon: Icon,
  suffix,
  className,
  id,
  required,
  ...rest
}: TextFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const input = (
    <input
      {...rest}
      id={fieldId}
      required={required}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? `${fieldId}-error` : undefined}
      className={clsx(
        styles.input,
        Icon && styles.inputWithPrefix,
        error && styles.inputError,
        className,
      )}
    />
  );

  return (
    <FieldShell
      id={fieldId}
      label={label}
      hint={hint}
      example={example}
      required={required}
      error={error}
    >
      {Icon || suffix ? (
        <div className={styles.withPrefix}>
          {Icon ? (
            <span className={styles.prefixIcon}>
              <Icon size={15} aria-hidden />
            </span>
          ) : null}
          {input}
          {suffix ? <span className={styles.suffixAction}>{suffix}</span> : null}
        </div>
      ) : (
        input
      )}
    </FieldShell>
  );
}

export interface TextareaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  example?: string;
  error?: string | null;
}

export function TextareaField({
  label,
  hint,
  example,
  error,
  className,
  id,
  required,
  ...rest
}: TextareaFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  return (
    <FieldShell
      id={fieldId}
      label={label}
      hint={hint}
      example={example}
      required={required}
      error={error}
    >
      <textarea
        {...rest}
        id={fieldId}
        required={required}
        aria-invalid={error ? true : undefined}
        className={clsx(styles.textarea, error && styles.inputError, className)}
      />
    </FieldShell>
  );
}

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string | null;
  options: SelectOption[];
}

export function SelectField({
  label,
  hint,
  error,
  options,
  className,
  id,
  required,
  ...rest
}: SelectFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  return (
    <FieldShell id={fieldId} label={label} hint={hint} error={error} required={required}>
      <select
        {...rest}
        id={fieldId}
        required={required}
        className={clsx(styles.select, className)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

export interface CheckboxProps {
  checked: boolean;
  onChange(checked: boolean): void;
  label: ReactNode;
  hint?: string;
}

export function Checkbox({ checked, onChange, label, hint }: CheckboxProps) {
  const id = useId();
  return (
    <div className={styles.field}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <button
          type="button"
          id={id}
          role="checkbox"
          aria-checked={checked}
          className={styles.checkbox}
          onClick={() => onChange(!checked)}
        >
          <Check size={12} aria-hidden strokeWidth={3} />
        </button>
        <label htmlFor={id} style={{ fontSize: 'var(--font-size-sm)', cursor: 'pointer' }}>
          {label}
        </label>
      </div>
      {hint ? <span className={styles.hint}>{hint}</span> : null}
    </div>
  );
}

export interface SwitchProps {
  checked: boolean;
  onChange(checked: boolean): void;
  label: string;
  hint?: string;
}

export function Switch({ checked, onChange, label, hint }: SwitchProps) {
  const id = useId();
  return (
    <div className={styles.field}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        <button
          type="button"
          id={id}
          role="switch"
          aria-checked={checked}
          aria-label={label}
          className={styles.switch}
          onClick={() => onChange(!checked)}
        >
          <span className={styles.switchThumb} />
        </button>
        <label htmlFor={id} style={{ fontSize: 'var(--font-size-sm)', cursor: 'pointer' }}>
          {label}
        </label>
      </div>
      {hint ? <span className={styles.hint}>{hint}</span> : null}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className={styles.kbd}>{children}</kbd>;
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Array<{ value: T; label: string; icon?: LucideIcon }>;
  onChange(value: T): void;
  label: string;
}): ReactNode {
  return (
    <div className={styles.segmented} role="tablist" aria-label={label}>
      {options.map((option) => {
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={value === option.value}
            className={styles.segment}
            onClick={() => onChange(option.value)}
          >
            {Icon ? <Icon size={13} aria-hidden /> : null}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
