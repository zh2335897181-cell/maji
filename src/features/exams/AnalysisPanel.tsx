import type { ExamAnalysis, ExamQuestion } from '../../lib/exams';
import styles from './exam.module.css';
export function AnalysisPanel({
  analysis,
  questions,
  onReference,
}: {
  analysis: ExamAnalysis;
  questions: ExamQuestion[];
  onReference?: (questionId: string, path: string, line: number) => void;
}) {
  return (
    <div className={styles.analysis}>
      <p>{analysis.summary}</p>
      {analysis.assessment !== 'unknown' && (
        <p>
          AI 评阅：
          {{ correct: '正确', partial: '部分正确', wrong: '需要订正' }[analysis.assessment]}
          （静态分析，仅供参考）
        </p>
      )}
      {!!analysis.steps.length && (
        <>
          <h3>解题步骤</h3>
          <ol>
            {analysis.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </>
      )}
      {analysis.answer && (
        <>
          <h3>答案与订正建议</h3>
          <pre>{analysis.answer}</pre>
        </>
      )}
      {!!analysis.pitfalls.length && (
        <>
          <h3>错误原因 / 易错点</h3>
          <ul>
            {analysis.pitfalls.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </>
      )}
      {!!analysis.concepts.length && (
        <>
          <h3>知识点与证据</h3>
          {analysis.concepts.map((c, i) => (
            <article key={i}>
              <strong>{c.name}</strong>
              <span className={styles.badge}>
                {new Set(c.questionIds).size < 2 ? '疑似弱项' : '多题支持'}
              </span>
              <p>{c.evidence}</p>
              <small>
                {c.questionIds
                  .map((id) => questions.find((q) => q.id === id)?.title ?? id)
                  .join('、')}
              </small>
            </article>
          ))}
        </>
      )}
      {!!analysis.refs.length && (
        <>
          <h3>代码证据</h3>
          {analysis.refs.map((r, i) => (
            <button
              type="button"
              className={styles.reference}
              key={i}
              onClick={() => onReference?.(r.questionId, r.path, r.line)}
            >
              {r.path}:{r.line}
              <code>{r.quote}</code>
            </button>
          ))}
        </>
      )}
      {!!analysis.missing.length && (
        <>
          <h3>缺失信息 / 待确认</h3>
          <ul>
            {analysis.missing.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </>
      )}
      <small>AI 未执行项目代码。请结合老师答案和实际运行结果核实。</small>
    </div>
  );
}
