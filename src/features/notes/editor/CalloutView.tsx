import { Info, Lightbulb, Terminal, TriangleAlert, type LucideIcon } from 'lucide-react';
import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import type { CalloutVariant } from '../../../lib/noteDoc';
import { CALLOUT_VARIANTS } from '../../../lib/noteDoc';
import styles from './editor.module.css';

const ICONS: Record<CalloutVariant, LucideIcon> = {
  note: Info,
  tip: Lightbulb,
  warning: TriangleAlert,
  output: Terminal,
};

const VARIANTS: CalloutVariant[] = ['note', 'tip', 'warning', 'output'];

/**
 * 语义块视图：说明 / 容易混淆 / 常见报错 / 运行结果。
 * 四种类型共用一套结构，只靠颜色与图标区分，保证笔记正文的节奏一致。
 */
export function CalloutView({ node, updateAttributes, editor }: NodeViewProps) {
  const variant = (node.attrs['variant'] as CalloutVariant) ?? 'note';
  const label = String(node.attrs['label'] ?? '') || CALLOUT_VARIANTS[variant].label;
  const Icon = ICONS[variant] ?? Info;

  return (
    <NodeViewWrapper className={styles.callout} data-variant={variant}>
      <div className={styles.calloutHeader} contentEditable={false}>
        <Icon size={15} aria-hidden className={styles.calloutIcon} />
        <span className={styles.calloutLabel}>{label}</span>
        {editor.isEditable ? (
          <label className={styles.calloutSwitch}>
            <span className="visually-hidden">切换语义块类型</span>
            <select
              value={variant}
              onChange={(event) => updateAttributes({ variant: event.target.value })}
            >
              {VARIANTS.map((item) => (
                <option key={item} value={item}>
                  {CALLOUT_VARIANTS[item].action}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      <NodeViewContent className={styles.calloutBody} />
    </NodeViewWrapper>
  );
}
