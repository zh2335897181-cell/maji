import type { Editor } from '@tiptap/react';
import { Braces, Info, Lightbulb, Terminal } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { asDoc, buildOutline } from '../../lib/noteDoc';
import type { OutlineItem, OutlineKind } from '../../lib/types';
import styles from './notes.module.css';

const KIND_ICON: Record<OutlineKind, typeof Info> = {
  heading: Info,
  code: Braces,
  callout: Lightbulb,
  output: Terminal,
};

export interface OutlinePanelProps {
  editor: Editor | null;
  /** 大纲项数量上限，超过时只显示标题层级 */
  compact?: boolean;
}

/**
 * 笔记大纲。
 * 数据来自编辑器文档（标题、代码块、语义块），点击后滚动到对应位置，
 * 滚动时反向高亮当前所在的小节。
 */
export function OutlinePanel({ editor, compact = false }: OutlinePanelProps): ReactElement {
  const [items, setItems] = useState<OutlineItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const rebuild = useCallback(() => {
    if (!editor) {
      setItems([]);
      return;
    }
    const outline = buildOutline(asDoc(editor.getJSON()));
    setItems(compact ? outline.filter((item) => item.kind === 'heading') : outline);
  }, [editor, compact]);

  useEffect(() => {
    if (!editor) return undefined;
    rebuild();
    editor.on('update', rebuild);
    return () => {
      editor.off('update', rebuild);
    };
  }, [editor, rebuild]);

  // 滚动时高亮当前小节
  useEffect(() => {
    if (!editor || items.length === 0) return undefined;
    const container = document.querySelector<HTMLElement>('[data-editor-scroll]');
    if (!container) return undefined;

    let frame = 0;
    const update = (): void => {
      frame = 0;
      const top = container.getBoundingClientRect().top + 72;
      let currentId: string | null = items[0]?.id ?? null;
      for (const item of items) {
        const node = editor.view.nodeDOM(item.pos) as HTMLElement | null;
        if (!node) continue;
        if (node.getBoundingClientRect().top <= top) currentId = item.id;
      }
      setActiveId(currentId);
    };

    const onScroll = (): void => {
      if (frame === 0) frame = window.requestAnimationFrame(update);
    };

    update();
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', onScroll);
      if (frame !== 0) window.cancelAnimationFrame(frame);
    };
  }, [editor, items]);

  const jumpTo = (item: OutlineItem): void => {
    if (!editor) return;
    const node = editor.view.nodeDOM(item.pos) as HTMLElement | null;
    if (!node) return;
    node.scrollIntoView({ behavior: 'smooth', block: 'start' });
    node.classList.add('maji-outline-target');
    window.setTimeout(() => node.classList.remove('maji-outline-target'), 1300);
    setActiveId(item.id);
  };

  if (items.length === 0) {
    return (
      <p className={styles.asideHint}>
        这篇笔记还没有小标题。用 <code>##</code> 或工具栏的标题按钮分节后，这里会显示可跳转的大纲。
      </p>
    );
  }

  return (
    <div className={styles.outline} ref={scrollRef}>
      <ul className={styles.outlineList} role="list">
        {items.map((item) => {
          const Icon = KIND_ICON[item.kind];
          return (
            <li key={item.id}>
              <button
                type="button"
                className={styles.outlineItem}
                data-level={item.level}
                data-kind={item.kind}
                data-active={item.id === activeId || undefined}
                onClick={() => jumpTo(item)}
              >
                <Icon size={12} aria-hidden className={styles.outlineIcon} />
                <span className={styles.outlineText}>{item.text}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
