import { useCallback, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { NoteEditor } from '../notes/NoteEditor';
import { EditorToolbar, type EditorMode } from '../notes/EditorToolbar';
import { asDoc, docToPlainText, noteStats } from '../../lib/noteDoc';
import type { ExamQuestion } from '../../lib/exams';
import styles from './exam.module.css';
export function QuestionEditor({
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
  const ready = useCallback((value: Editor) => setEditor(value), []);
  return (
    <fieldset disabled={disabled} className={styles.questionFields}>
      <div className={styles.meta}>
        <label>
          题目名称
          <input
            aria-label="题目名称"
            value={question.title}
            onChange={(e) => onChange({ title: e.target.value })}
          />
        </label>
        <label>
          题型
          <select
            aria-label="题型"
            value={question.type}
            onChange={(e) => onChange({ type: e.target.value })}
          >
            {['概念题', '选择题', '简答题', '代码阅读', '代码补全', '代码纠错', '项目题'].map(
              (t) => (
                <option key={t}>{t}</option>
              ),
            )}
          </select>
        </label>
        <label>
          分值
          <input
            type="number"
            min="0"
            max="10000"
            aria-label="分值"
            value={question.points}
            onChange={(e) => onChange({ points: Number(e.target.value) })}
          />
        </label>
      </div>
      <h3>题干与要求</h3>
      <div className={styles.promptEditor}>
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
          label="考试题干"
          onChange={(json) =>
            onChange({ promptDoc: json, prompt: docToPlainText(asDoc(JSON.parse(json))) })
          }
        />
      </div>
      <label>
        老师参考答案（可留空）
        <textarea
          aria-label="老师参考答案"
          value={question.referenceAnswer}
          onChange={(e) => onChange({ referenceAnswer: e.target.value })}
        />
      </label>
      <label>
        我的原始答案
        <textarea
          aria-label="我的原始答案"
          value={question.originalAnswer}
          onChange={(e) => onChange({ originalAnswer: e.target.value })}
        />
      </label>
      <label>
        订正答案（不覆盖原始答案）
        <textarea
          aria-label="订正答案"
          value={question.correction}
          onChange={(e) => onChange({ correction: e.target.value })}
        />
      </label>
    </fieldset>
  );
}
