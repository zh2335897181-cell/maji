import type { Editor } from '@tiptap/react';
import { Check, LoaderCircle, Sparkles, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactElement } from 'react';
import type { AIContext } from '../../lib/ipc';
import type { LanguageId } from '../../lib/types';
import styles from './AICompletionAssistant.module.css';

const CONSENT_KEY = 'maji.ai.consent.v1';
const MAX_CONTEXT_UNITS = 12_000;
const REQUEST_EVENT = 'maji:ai-complete';

interface CompletionCapture {
  from: number;
  to: number;
  doc: Editor['state']['doc'];
  context: AIContext;
  anchor: { top: number; bottom: number; left: number; right: number };
}

export interface AICompletionAssistantProps {
  editor: Editor | null;
  editable: boolean;
  language: LanguageId;
  onOpenSettings(): void;
}

export function AICompletionAssistant({
  editor,
  editable,
  language,
  onOpenSettings,
}: AICompletionAssistantProps): ReactElement | null {
  const [capture, setCapture] = useState<CompletionCapture | null>(null);
  const [suggestion, setSuggestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [consentRequired, setConsentRequired] = useState(false);
  const [error, setError] = useState('');
  const [position, setPosition] = useState({ left: 24, top: 80 });
  const requestId = useRef(0);
  const captureRef = useRef<CompletionCapture | null>(null);
  const latest = useRef<{
    begin(): void;
    accept(): void;
    clear(): void;
    suggestion: string;
    busy: boolean;
    consentRequired: boolean;
    error: string;
  }>({ begin: () => undefined, accept: () => undefined, clear: () => undefined, suggestion, busy, consentRequired, error });

  const clear = useCallback(() => {
    requestId.current += 1;
    captureRef.current = null;
    setCapture(null);
    setSuggestion('');
    setBusy(false);
    setConsentRequired(false);
    setError('');
  }, []);

  const requestSuggestion = useCallback(async () => {
    const current = captureRef.current;
    if (!current || busy) return;
    const api = window.maji?.ai;
    if (!api) {
      setError('仅桌面版可使用 AI；浏览器预览不会发送笔记内容');
      return;
    }
    const id = ++requestId.current;
    setBusy(true);
    setConsentRequired(false);
    setSuggestion('');
    setError('');
    try {
      const result = await api.ask('continue', current.context);
      if (requestId.current === id && captureRef.current === current) {
        if (result.kind !== 'text' || !result.text.trim()) setError('AI 没有生成可用的续写内容');
        else setSuggestion(result.text);
      }
    } catch (reason) {
      if (requestId.current === id) setError(reason instanceof Error ? reason.message : 'AI 续写失败，请重试');
    } finally {
      if (requestId.current === id) setBusy(false);
    }
  }, [busy]);

  const begin = useCallback(() => {
    if (!editor || !editable || busy) return;
    const selection = editor.state.selection;
    if (!selection.$from.parent.isTextblock) return;
    const block = selection.$from.parent;
    const code = block.type.name === 'codeBlock';
    const contextFrom = Math.max(0, selection.from - 800);
    const contextTo = Math.min(editor.state.doc.content.size, selection.to + 800);
    const before = editor.state.doc.textBetween(contextFrom, selection.from, '\n');
    const after = editor.state.doc.textBetween(selection.to, contextTo, '\n');
    let anchor: CompletionCapture['anchor'];
    try {
      anchor = editor.view.coordsAtPos(selection.to);
    } catch {
      return;
    }
    const blockLanguage = String(block.attrs['language'] ?? language);
    const safeLanguage: LanguageId = ['python', 'javascript', 'typescript', 'html', 'css', 'java', 'c', 'text']
      .includes(blockLanguage) ? blockLanguage as LanguageId : language;
    const next: CompletionCapture = {
      from: selection.from,
      to: selection.to,
      doc: editor.state.doc,
      context: {
        selectedText: '',
        scope: 'completion',
        language: safeLanguage,
        continuation: { before, after, code },
      },
      anchor,
    };
    requestId.current += 1;
    captureRef.current = next;
    setCapture(next);
    setSuggestion('');
    setError('');
    if (before.length + after.length > MAX_CONTEXT_UNITS) {
      setError('当前段落超过 12,000 字符，请缩小上下文后重试');
      return;
    }
    if (!before.trim() && !after.trim()) {
      setError('先在当前段落写一点内容，再让 AI 续写');
      return;
    }
    let hasConsent = false;
    try { hasConsent = localStorage.getItem(CONSENT_KEY) === '1'; } catch { /* Ask for confirmation when storage is unavailable. */ }
    if (!hasConsent) {
      setConsentRequired(true);
      setBusy(false);
      return;
    }
    void requestSuggestion();
  }, [busy, editor, editable, language, requestSuggestion]);

  const accept = useCallback(() => {
    if (!editor || !suggestion || !captureRef.current) return;
    const current = captureRef.current;
    const selection = editor.state.selection;
    if (!editor.state.doc.eq(current.doc) || selection.from !== current.from || selection.to !== current.to) {
      clear();
      return;
    }
    const text = suggestion;
    clear();
    editor.chain().focus().insertContentAt({ from: current.from, to: current.to }, text).run();
  }, [clear, editor, suggestion]);

  latest.current = { begin, accept, clear, suggestion, busy, consentRequired, error };

  useEffect(() => {
    if (!editor || !editable) {
      clear();
      return undefined;
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      const requestShortcut = (event.ctrlKey || event.metaKey) && event.shiftKey && !event.altKey &&
        (event.code === 'Space' || event.key === ' ' || event.key === 'Spacebar');
      if (requestShortcut && !latest.current.suggestion && !latest.current.busy) {
        event.preventDefault();
        event.stopPropagation();
        latest.current.begin();
      } else if (latest.current.suggestion && event.key === 'Tab') {
        event.preventDefault();
        event.stopPropagation();
        latest.current.accept();
      } else if ((latest.current.suggestion || latest.current.busy || latest.current.consentRequired || latest.current.error) && event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        latest.current.clear();
      }
    };
    const onTransaction = ({ transaction }: { transaction: { docChanged: boolean } }): void => {
      if (transaction.docChanged && captureRef.current) latest.current.clear();
    };
    const onSelection = (): void => {
      const current = captureRef.current;
      const selection = editor.state.selection;
      if (current && (selection.from !== current.from || selection.to !== current.to)) latest.current.clear();
    };
    const onRequest = (): void => latest.current.begin();
    editor.view.dom.addEventListener('keydown', onKeyDown, true);
    editor.on('transaction', onTransaction);
    editor.on('selectionUpdate', onSelection);
    window.addEventListener(REQUEST_EVENT, onRequest);
    return () => {
      editor.view.dom.removeEventListener('keydown', onKeyDown, true);
      editor.off('transaction', onTransaction);
      editor.off('selectionUpdate', onSelection);
      window.removeEventListener(REQUEST_EVENT, onRequest);
      clear();
    };
  }, [clear, editable, editor]);

  useEffect(() => {
    if (!capture) return;
    const width = Math.min(480, window.innerWidth - 24);
    const height = Math.min(260, window.innerHeight - 24);
    const left = Math.max(12, Math.min(capture.anchor.left, window.innerWidth - width - 12));
    const below = capture.anchor.bottom + 10;
    setPosition({ left, top: below + height < window.innerHeight ? below : Math.max(12, capture.anchor.top - height - 10) });
  }, [capture, suggestion, error, consentRequired]);

  if (!capture || !editable || (!busy && !suggestion && !consentRequired && !error)) return null;
  const style: CSSProperties = { left: position.left, top: position.top };

  return (
    <section
      className={styles.panel}
      style={style}
      aria-label="AI 续写建议"
      aria-live="polite"
      data-testid="ai-completion-assistant"
      onPointerDown={(event) => event.preventDefault()}
    >
      <div className={styles.header}>
        <span><Sparkles size={14} aria-hidden />AI 续写</span>
        <button type="button" className={styles.iconButton} aria-label="关闭续写建议" onClick={clear}><X size={15} aria-hidden /></button>
      </div>
      {consentRequired ? (
        <>
          <p className={styles.disclosure}>光标所在段落的前后内容会发送到你配置的 AI 服务以生成续写。请求只会在你确认后发出。</p>
          <div className={styles.actions}>
            <button type="button" className={styles.textButton} onClick={onOpenSettings}>AI 设置</button>
            <button type="button" className={styles.primaryButton} onClick={() => {
              try { localStorage.setItem(CONSENT_KEY, '1'); } catch { /* This request remains an explicit user action. */ }
              void requestSuggestion();
            }}>我已了解，继续</button>
          </div>
        </>
      ) : null}
      {busy ? <p className={styles.loading}><LoaderCircle size={15} className={styles.spinner} aria-hidden />正在生成续写…</p> : null}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {suggestion ? (
        <>
          <pre className={styles.suggestion}>{suggestion}</pre>
          <div className={styles.actions}>
            <span className={styles.hint}>Tab 接受 · Esc 忽略</span>
            <button type="button" className={styles.primaryButton} onClick={accept}><Check size={14} aria-hidden />接受</button>
          </div>
        </>
      ) : null}
    </section>
  );
}
