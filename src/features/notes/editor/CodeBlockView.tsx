import { Check, Copy } from 'lucide-react';
import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { useEffect, useMemo, useState } from 'react';
import { copyText } from '../../../lib/clipboard';
import { escapeHtml, highlightCode, type HighlightTheme } from '../../../lib/highlight';
import { LANGUAGES, languageName } from '../../../lib/languages';
import { useLibrary } from '../../../app/LibraryProvider';
import styles from './editor.module.css';

/**
 * 代码块视图。
 *
 * 两种呈现方式：
 *   · 未聚焦时 —— Shiki 语法高亮 + 语言选择 + 复制按钮（阅读态）
 *   · 光标进入时 —— 可编辑的纯文本（输入态，避免高亮层与光标打架）
 *
 * 注意：NodeViewContent 必须始终渲染。ProseMirror 把它的元素当作 contentDOM，
 * 一旦条件渲染导致它被卸载，PM 会把这个元素挂到节点视图根节点上，
 * 结果就是代码在正文里出现两份。这里改为“常驻 + CSS 切换显示”。
 */
export function CodeBlockView({ node, updateAttributes, editor, getPos }: NodeViewProps) {
  const { settings } = useLibrary();
  const theme: HighlightTheme = settings.theme === 'dark' ? 'dark' : 'light';
  const code = useMemo(() => node.textContent, [node]);
  const language = String(node.attrs['language'] ?? 'text');

  const [html, setHtml] = useState('');
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);

  // 光标是否落在本代码块内部：决定“高亮阅读”还是“纯文本编辑”
  useEffect(() => {
    const compute = (): void => {
      const pos = typeof getPos === 'function' ? getPos() : undefined;
      if (typeof pos !== 'number') {
        setEditing(false);
        return;
      }
      const { from, to } = editor.state.selection;
      setEditing(editor.isEditable && from >= pos && to <= pos + node.nodeSize);
    };
    compute();
    editor.on('selectionUpdate', compute);
    editor.on('focus', compute);
    editor.on('blur', compute);
    return () => {
      editor.off('selectionUpdate', compute);
      editor.off('focus', compute);
      editor.off('blur', compute);
    };
  }, [editor, getPos, node.nodeSize]);

  // 整块被选中（点击代码块）时把光标放进代码里，
  // 否则下一次输入会替换掉整个代码块。
  useEffect(() => {
    if (!editing) return;
    const pos = typeof getPos === 'function' ? getPos() : undefined;
    if (typeof pos !== 'number') return;
    const { from, empty } = editor.state.selection;
    if (!empty || from !== pos) return;
    editor.commands.setTextSelection(pos + 1 + node.textContent.length);
  }, [editing, editor, getPos, node]);

  useEffect(() => {
    let cancelled = false;
    void highlightCode(code, language, theme).then((result) => {
      if (!cancelled) setHtml(result);
    });
    return () => {
      cancelled = true;
    };
  }, [code, language, theme]);

  useEffect(() => {
    if (!copied) return undefined;
    const timer = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const onCopy = async (): Promise<void> => {
    const ok = await copyText(code);
    setCopied(ok);
  };

  return (
    <NodeViewWrapper
      className={styles.codeBlock}
      data-language={language}
      data-editing={editing || undefined}
    >
      <div className={styles.codeHeader} contentEditable={false}>
        <label className="visually-hidden" htmlFor={`code-lang-${language}-${code.length}`}>
          代码语言
        </label>
        <select
          id={`code-lang-${language}-${code.length}`}
          className={styles.langSelect}
          value={language}
          disabled={!editor.isEditable}
          onChange={(event) => updateAttributes({ language: event.target.value })}
        >
          {LANGUAGES.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        <span className={styles.codeHint}>{languageName(language)} 代码</span>
        <button
          type="button"
          className={styles.copyButton}
          onClick={() => void onCopy()}
          aria-label="复制代码"
          data-copied={copied || undefined}
        >
          {copied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
          {copied ? '已复制' : '复制'}
        </button>
      </div>

      <pre className={styles.codePre}>
        {/* 可编辑内容（常驻，避免 ProseMirror 的 contentDOM 被搬走） */}
        <NodeViewContent className={styles.codeText} />
        {/* 阅读态高亮层：Shiki 输出已转义，可直接注入 */}
        {editing ? null : (
          <code
            className={styles.codeText}
            dangerouslySetInnerHTML={{ __html: html || escapeHtml(code) }}
          />
        )}
      </pre>
    </NodeViewWrapper>
  );
}
