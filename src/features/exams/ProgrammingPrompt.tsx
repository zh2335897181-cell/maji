import { useCallback, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { NoteEditor } from '../notes/NoteEditor';
import { EditorToolbar, type EditorMode } from '../notes/EditorToolbar';
import { asDoc, docToPlainText, noteStats } from '../../lib/noteDoc';
import type { ExamQuestion } from '../../lib/exams';
import styles from './exam.module.css';
export function ProgrammingPrompt({
  question,
  onChange,
  disabled,
}: {
  question: ExamQuestion;
  onChange: (patch: Partial<ExamQuestion>) => void;
  disabled: boolean;
}) {
  const [editor, setEditor] = useState<Editor | null>(null),
    [mode, setMode] = useState<EditorMode>('edit');
  const ready = useCallback((instance: Editor) => setEditor(instance), []);
  return (
    <section className={styles.questionFields}>
      <h2>题目要求</h2>
      <p className={styles.muted}>描述当前编程题的目标、输入输出和约束。只分析本模块代码。</p>
      <div className={styles.promptEditor} inert={disabled}>
        <EditorToolbar
          editor={editor}
          mode={mode}
          onModeChange={setMode}
          language="text"
          stats={noteStats(asDoc(JSON.parse(question.promptDoc)))}
          showAI={false}
        />
        <NoteEditor
          content={question.promptDoc}
          editable={!disabled && mode === 'edit'}
          onReady={ready}
          label="编程题要求"
          onChange={(json) => {
            if (!disabled)
              onChange({ promptDoc: json, prompt: docToPlainText(asDoc(JSON.parse(json))) });
          }}
        />
      </div>
      <details className={styles.optionalAnswers}>
        <summary>补充参考答案与自己的思路（可选）</summary>
        <label>
          参考答案
          <textarea
            aria-label="模块参考答案"
            disabled={disabled}
            value={question.referenceAnswer}
            onChange={(e) => onChange({ referenceAnswer: e.target.value })}
          />
        </label>
        <label>
          我的解题思路
          <textarea
            aria-label="模块解题思路"
            disabled={disabled}
            value={question.originalAnswer}
            onChange={(e) => onChange({ originalAnswer: e.target.value })}
          />
        </label>
      </details>
    </section>
  );
}
