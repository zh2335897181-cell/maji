import { useEffect, useRef } from 'react';
import type { ExamTraining, ExamQuestion } from '../../lib/exams';
import { AnalysisPanel } from './AnalysisPanel';
import styles from './exam.module.css';
export function TrainingPanel({
  training,
  questions,
  onChange,
  onGrade,
  disabled,
}: {
  training: ExamTraining;
  questions: ExamQuestion[];
  onChange: (patch: Partial<ExamTraining>) => void;
  onGrade: () => void;
  disabled: boolean;
}) {
  const patch = useRef(onChange);
  patch.current = onChange;
  useEffect(() => {
    if (training.submittedAt || disabled) return;
    let active = false,
      last = performance.now(),
      fraction = 0;
    const tick = () => {
      const now = performance.now(),
        elapsed = Math.min((now - last) / 1000, 2);
      last = now;
      if (active && !document.hidden && document.hasFocus()) {
        fraction += elapsed;
        const seconds = Math.floor(fraction);
        if (seconds) {
          fraction -= seconds;
          patch.current({ durationSeconds: Math.min(604800, trainingTime.current + seconds) });
        }
      }
    };
    const focus = () => {
        active = true;
        last = performance.now();
      },
      blur = () => {
        tick();
        active = false;
      };
    const box = document.getElementById(`answer-${training.id}`);
    box?.addEventListener('focus', focus);
    box?.addEventListener('blur', blur);
    const visibility = () => {
      last = performance.now();
    };
    document.addEventListener('visibilitychange', visibility);
    const timer = setInterval(tick, 1000);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', visibility);
      box?.removeEventListener('focus', focus);
      box?.removeEventListener('blur', blur);
    };
  }, [training.id, training.submittedAt, disabled]);
  const trainingTime = useRef(training.durationSeconds);
  trainingTime.current = training.durationSeconds;
  return (
    <section className={styles.training}>
      <span className={styles.badge}>
        {{ basic: '基础理解', repair: '定点修复', project: '综合应用' }[training.level]} ·{' '}
        {training.topic}
      </span>
      <h2>{training.title}</h2>
      <pre>{training.prompt}</pre>
      {training.files.map((f) => (
        <details key={f.id} open>
          <summary>
            {f.path} · {f.role}
          </summary>
          <pre className={styles.readCode}>{f.content}</pre>
        </details>
      ))}
      <label>
        训练答案
        <textarea
          id={`answer-${training.id}`}
          aria-label="训练答案"
          value={training.answer}
          disabled={disabled || !!training.submittedAt}
          onChange={(e) => onChange({ answer: e.target.value })}
        />
      </label>
      <p>有效作答时间：{training.durationSeconds} 秒 · 仅累计窗口激活且答案框聚焦的时间。</p>
      {!training.submittedAt ? (
        <button
          className={styles.primary}
          disabled={disabled || !training.answer.trim()}
          onClick={onGrade}
        >
          提交答案并 AI 评阅
        </button>
      ) : (
        <>
          <p>提交时间：{new Date(training.submittedAt).toLocaleString('zh-CN')}</p>
          <h3>参考答案</h3>
          <pre>{training.referenceAnswer}</pre>
          <h3>答案解析</h3>
          <pre>{training.explanation}</pre>
          {training.feedback && (
            <AnalysisPanel analysis={training.feedback} questions={questions} />
          )}
          <button
            disabled={disabled}
            onClick={() => onChange({ submittedAt: null, feedback: null })}
          >
            重新作答
          </button>
        </>
      )}
    </section>
  );
}
