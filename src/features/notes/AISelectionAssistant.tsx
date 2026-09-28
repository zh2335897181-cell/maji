import type { Editor } from '@tiptap/react';
import { Check, Code2, FileText, Lightbulb, LoaderCircle, Sparkles, X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactElement } from 'react';
import type { AIAction, AIContext, AIResult } from '../../lib/ipc';
import type { ExerciseInput, LanguageId } from '../../lib/types';
import { copyText } from '../../lib/clipboard';
import { IconButton } from '../../components/ui/Button';
import styles from './AISelectionAssistant.module.css';

interface SelectionCapture {
  from: number;
  to: number;
  selectedText: string;
  anchor: { top: number; bottom: number; left: number; right: number };
}

export interface AISelectionAssistantProps {
  editor: Editor | null;
  editable: boolean;
  noteId: string;
  noteText: string;
  language: LanguageId;
  courseId: string;
  onCreateExercise(input: ExerciseInput): Promise<void>;
  onOpenSettings(): void;
}

const MAX_INPUT_UNITS = 12_000;
const CONSENT_KEY = 'maji.ai.consent.v1';
const ACTIONS: Array<{ id: AIAction; label: string; icon: typeof Lightbulb }> = [
  { id: 'explain', label: '解释这段内容', icon: Lightbulb },
  { id: 'organize', label: '整理成笔记', icon: FileText },
  { id: 'exercise', label: '生成练习题', icon: Code2 },
];

export function AISelectionAssistant({
  editor,
  editable,
  noteId,
  noteText,
  language,
  courseId,
  onCreateExercise,
  onOpenSettings,
}: AISelectionAssistantProps): ReactElement | null {
  const [capture, setCapture] = useState<SelectionCapture | null>(null);
  const [scope, setScope] = useState<'selection' | 'note'>('selection');
  const [consent, setConsent] = useState(() => localStorage.getItem(CONSENT_KEY) === '1');
  const [pendingAction, setPendingAction] = useState<AIAction | null>(null);
  const [activeAction, setActiveAction] = useState<AIAction | null>(null);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [savingExercise, setSavingExercise] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [position, setPosition] = useState({ left: 24, top: 80 });
  const containerRef = useRef<HTMLDivElement>(null);
  const requestId = useRef(0);
  const captureRef = useRef<SelectionCapture | null>(null);

  const close = useCallback(() => {
    requestId.current += 1;
    captureRef.current = null;
    setCapture(null);
    setScope('selection');
    setPendingAction(null);
    setActiveAction(null);
    setResult(null);
    setError('');
    setBusy(false);
    setPanelOpen(false);
  }, []);

  useEffect(() => {
    if (!editor || !editable) {
      close();
      return;
    }
    requestId.current += 1;
    captureRef.current = null;
    setCapture(null);
    setScope('selection');
    setPendingAction(null);
    setResult(null);
    setError('');
    setBusy(false);
    const refreshSelection = (): void => {
      const { selection } = editor.state;
      if (selection.empty || !selection.$from.parent.isTextblock || !selection.$to.parent.isTextblock) {
        captureRef.current = null;
        setCapture(null);
        setPanelOpen(false);
        setScope('selection');
        setPendingAction(null);
        setResult(null);
        setError('');
        requestId.current += 1;
        return;
      }
      const selectedText = editor.state.doc.textBetween(selection.from, selection.to, '\n');
      if (!selectedText.trim()) {
        captureRef.current = null;
        setCapture(null);
        return;
      }
      let anchor = { top: 0, bottom: 0, left: 0, right: 0 };
      try { anchor = editor.view.coordsAtPos(selection.to); } catch { return; }
      const next = { from: selection.from, to: selection.to, selectedText, anchor };
      const previous = captureRef.current;
      captureRef.current = next;
      if (previous?.from === next.from && previous.to === next.to && previous.selectedText === next.selectedText) {
        setCapture((current) => current ? { ...current, anchor } : next);
        return;
      }
      requestId.current += 1;
      setCapture(next);
      setPanelOpen(false);
      setScope('selection');
      setPendingAction(null);
      setResult(null);
      setError('');
      setBusy(false);
    };
    refreshSelection();
    editor.on('selectionUpdate', refreshSelection);
    const scrollHost = editor.view.dom.closest<HTMLElement>('[data-editor-scroll]');
    const reposition = (): void => refreshSelection();
    window.addEventListener('resize', reposition);
    scrollHost?.addEventListener('scroll', reposition, { passive: true });
    return () => {
      editor.off('selectionUpdate', refreshSelection);
      window.removeEventListener('resize', reposition);
      scrollHost?.removeEventListener('scroll', reposition);
    };
  }, [close, editable, editor, noteId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && capture) close();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [capture, close]);

  const updatePosition = useCallback(() => {
    if (!capture) return;
    const anchor = capture.anchor;
    const bounds = containerRef.current?.getBoundingClientRect();
    const width = Math.min(bounds?.width || (panelOpen ? 380 : 420), window.innerWidth - 24);
    const panelVisible = panelOpen || scope === 'note';
    const height = Math.min(bounds?.height || (panelVisible ? 360 : 64), window.innerHeight - 24);
    const left = Math.max(12, Math.min(anchor.left, window.innerWidth - width - 12));
    const below = anchor.bottom + 10;
    const top = below + height <= window.innerHeight - 12
      ? below
      : Math.max(12, anchor.top - height - 10);
    setPosition({ left, top });
  }, [capture, panelOpen, scope]);

  useLayoutEffect(() => { updatePosition(); }, [updatePosition, result, error, pendingAction]);

  const performAction = useCallback(async (action: AIAction) => {
    if (!capture || busy) return;
    if (capture.selectedText.length > MAX_INPUT_UNITS || (scope === 'note' && noteText.length > MAX_INPUT_UNITS)) {
      setError('内容超过 12,000 个字符上限，请缩小选区或整理笔记后重试');
      setPanelOpen(true);
      return;
    }
    const api = window.maji?.ai;
    if (!api) {
      setError('仅桌面版可使用 AI；浏览器预览不会发送笔记内容');
      setPanelOpen(true);
      return;
    }
    const callId = requestId.current;
    const context: AIContext = {
      selectedText: capture.selectedText,
      ...(scope === 'note' ? { noteText, scope: 'note' as const } : { scope: 'selection' as const }),
      language,
    };
    setActiveAction(action);
    setPendingAction(null);
    setPanelOpen(true);
    setBusy(true);
    setResult(null);
    setError('');
    try {
      const response = await api.ask(action, context);
      if (requestId.current === callId) setResult(response);
    } catch (reason) {
      if (requestId.current === callId) setError(reason instanceof Error ? reason.message : 'AI 请求失败，请重试');
    } finally {
      if (requestId.current === callId) setBusy(false);
    }
  }, [busy, capture, language, noteText, scope]);

  const startAction = (action: AIAction): void => {
    if (!consent) {
      setPendingAction(action);
      setPanelOpen(true);
      setError('');
      return;
    }
    void performAction(action);
  };

  const acknowledgeConsent = (): void => {
    setConsent(true);
    try { localStorage.setItem(CONSENT_KEY, '1'); } catch { /* Consent remains for this window session. */ }
    if (pendingAction) void performAction(pendingAction);
  };

  const insertResult = (): void => {
    if (!editor || !capture || !result || result.kind !== 'text') return;
    const paragraphs = result.text.split(/\r?\n/).map((line) => ({
      type: 'paragraph',
      ...(line ? { content: [{ type: 'text', text: line }] } : {}),
    }));
    const $end = editor.state.doc.resolve(capture.to);
    const blockDepth = $end.depth;
    const insertAt = $end.parent.type.name === 'codeBlock' ? $end.after(blockDepth) : capture.to;
    editor.chain().focus().insertContentAt(insertAt, paragraphs).run();
  };

  const addExercise = async (): Promise<void> => {
    if (!capture || !result || result.kind !== 'exercise' || savingExercise) return;
    setSavingExercise(true);
    setError('');
    try {
      await onCreateExercise({
        title: result.title,
        prompt: result.prompt,
        hint: result.hint,
        solution: result.solution,
        language,
        difficulty: 'easy',
        noteId,
        courseId,
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '添加练习失败，请重试');
    } finally {
      setSavingExercise(false);
    }
  };

  if (!capture || !editable) return null;
  const tooLong = capture.selectedText.length > MAX_INPUT_UNITS || (scope === 'note' && noteText.length > MAX_INPUT_UNITS);
  const activeLabel = ACTIONS.find((action) => action.id === activeAction)?.label ?? 'AI 学习助手';
  const style: CSSProperties = { left: position.left, top: position.top };

  return (
    <div ref={containerRef} className={styles.container} style={style}
      onPointerDown={(event) => event.preventDefault()} data-testid="ai-selection-assistant">
      <div className={styles.toolbar} aria-label="AI 学习助手操作">
        <span className={styles.scopeLabel}><Sparkles size={14} aria-hidden />{scope === 'selection' ? '仅所选内容' : '结合整篇笔记'}</span>
        <button type="button" className={styles.scopeButton} aria-pressed={scope === 'selection'} onClick={() => setScope('selection')}>仅所选内容</button>
        <button type="button" className={styles.scopeButton} aria-pressed={scope === 'note'} onClick={() => setScope('note')}>结合整篇笔记</button>
        <span className={styles.divider} />
        {ACTIONS.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" className={styles.actionButton} disabled={busy || tooLong} onClick={() => startAction(id)} aria-label={label}>
            <Icon size={15} aria-hidden />{label.replace('这段内容', '')}
          </button>
        ))}
        {!window.maji ? <span className={styles.limitNotice}>仅桌面版可使用 AI</span> : null}
        {tooLong ? <span className={styles.limitNotice}>选区过长，请缩小选区</span> : null}
        <IconButton icon={X} label="关闭 AI 面板" size="sm" onClick={close} />
      </div>
      {(scope === 'note' || panelOpen) ? (
        <section className={styles.panel} aria-label="AI 结果面板">
          <div className={styles.panelHeading}>
            <span><Sparkles size={15} aria-hidden />{activeLabel}</span>
            <IconButton icon={X} label="关闭 AI 面板" size="sm" onClick={close} />
          </div>
          {scope === 'note' ? <p className={styles.disclosure}>整篇笔记正文将发送到你配置的 AI 服务。点击 AI 操作前可切回“仅所选内容”。</p> : null}
          {tooLong ? <p className={styles.error} role="alert">选区或笔记超过 12,000 字符上限，请缩小选区。</p> : null}
          {pendingAction ? (
            <div className={styles.consent}>
              <p>首次使用 AI：{scope === 'note' ? '整篇笔记正文' : '选中内容'}会发送到你配置的 AI 服务用于生成回答。请求只在你确认后发出。</p>
              <div className={styles.panelActions}>
                <button type="button" className={styles.textButton} onClick={onOpenSettings}>打开 AI 设置</button>
                <button type="button" className={styles.primaryButton} onClick={acknowledgeConsent}>我已了解，继续</button>
              </div>
            </div>
          ) : null}
          {busy ? <p className={styles.status}><LoaderCircle size={15} className={styles.spinner} aria-hidden />正在生成…</p> : null}
          {error ? (
            <div className={styles.error} role="alert">
              {error}{' '}
              {activeAction ? <button type="button" className={styles.textButton} onClick={() => void performAction(activeAction)}>重试</button> : null}
              <button type="button" className={styles.textButton} onClick={onOpenSettings}>打开 AI 设置</button>
            </div>
          ) : null}
          {result?.kind === 'text' ? (
            <>
              <div className={styles.resultText}>{result.text}</div>
              <div className={styles.panelActions}>
                <button type="button" className={styles.primaryButton} onClick={insertResult}>插入到笔记</button>
                <button type="button" className={styles.textButton} onClick={() => void copyText(result.text)}>复制回答</button>
                {activeAction ? <button type="button" className={styles.textButton} onClick={() => void performAction(activeAction)}>重新生成</button> : null}
              </div>
            </>
          ) : null}
          {result?.kind === 'exercise' ? (
            <div className={styles.exerciseResult}>
              <strong>{result.title}</strong><p>{result.prompt}</p><p><b>提示：</b>{result.hint}</p>
              <details><summary>参考答案</summary><pre>{result.solution}</pre></details>
              <button type="button" className={styles.primaryButton} disabled={savingExercise} onClick={() => void addExercise()}><Check size={14} aria-hidden />{savingExercise ? '正在添加…' : '添加为关联练习'}</button>
            </div>
          ) : null}
          {!busy && !result && !pendingAction && !error ? <p className={styles.muted}>选择一个 AI 操作，结果会先显示在这里。</p> : null}
        </section>
      ) : null}
    </div>
  );
}
