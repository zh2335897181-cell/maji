import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from 'lucide-react';
import { useLibrary } from '../../app/LibraryProvider';
import { Button } from '../../components/ui/Button';
import type { ReviewAction, ReviewGrade, ReviewQuestion, ReviewSessionWithQuestions } from '../../lib/types';
import { formatReviewDuration, getActiveSecondsByLocalDay } from './reviewSession';
import styles from './review.module.css';

export function ReviewSessionRunner({ session: initialSession, onBack }: { session: ReviewSessionWithQuestions; onBack(): void }): ReactElement {
  const { updateReviewSession, saveReviewAnswer, saveReviewGrade, applyReviewAction } = useLibrary();
  const [session, setSession] = useState(initialSession);
  const sessionRef = useRef(session);
  const disposeTimer = useRef<number | null>(null);
  const checkpointBusy = useRef(false);
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [gradeRetry, setGradeRetry] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [scheduleSaved, setScheduleSaved] = useState(false);
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const [active, setActive] = useState(session.status === 'in-progress');
  const activeSeconds = useMemo(() => [...getActiveSecondsByLocalDay(session.activeSegments, session.activeSegmentStartedAt, new Date(now)).values()].reduce((sum, value) => sum + value, 0), [now, session.activeSegments, session.activeSegmentStartedAt]);
  const currentIndex = Math.max(0, session.questions.findIndex((question) => !question.grade));
  const [questionIndex, setQuestionIndex] = useState(currentIndex);
  const selectedQuestion = session.questions[questionIndex];
  const gradedCount = session.questions.filter((item) => item.grade).length;
  const isCompleted = session.status === 'completed';

  const setCurrentSession = (value: ReviewSessionWithQuestions): void => { sessionRef.current = value; setSession(value); };

  const closeActiveInterval = useCallback(async (end = new Date()): Promise<ReviewSessionWithQuestions> => {
    const current = sessionRef.current;
    const start = current.activeSegmentStartedAt;
    const patch = start ? {
      activeSegments: [...current.activeSegments, { startedAt: start, endedAt: end.toISOString() }],
      activeSegmentStartedAt: null,
    } : {};
    const updated = await updateReviewSession(current.id, patch);
    sessionRef.current = updated; setSession(updated);
    return updated;
  }, [updateReviewSession]);

  const pauseSession = useCallback(async () => {
    if (!sessionRef.current.activeSegmentStartedAt) { setActive(false); return; }
    await closeActiveInterval(); setActive(false);
  }, [closeActiveInterval]);

  const resumeSession = async (): Promise<void> => {
    if (sessionRef.current.status === 'completed' || sessionRef.current.activeSegmentStartedAt) { setActive(true); return; }
    const updated = await updateReviewSession(sessionRef.current.id, { activeSegmentStartedAt: new Date().toISOString() });
    setCurrentSession(updated); setActive(true);
  };

  // A prior open segment is cut off at its last persisted heartbeat so app downtime is not counted.
  useEffect(() => {
    let live = true;
    const current = sessionRef.current;
    if (current.status === 'in-progress' && current.activeSegmentStartedAt) {
      const heartbeat = new Date(current.updatedAt);
      const start = new Date(current.activeSegmentStartedAt);
      const segments = [...current.activeSegments];
      if (heartbeat > start) segments.push({ startedAt: start.toISOString(), endedAt: heartbeat.toISOString() });
      void updateReviewSession(current.id, { activeSegments: segments, activeSegmentStartedAt: new Date().toISOString() })
        .then((updated) => { if (live && updated) setCurrentSession(updated); })
        .catch((cause) => { if (live) setError(cause instanceof Error ? cause.message : '恢复练习计时失败'); });
    }
    return () => { live = false; };
  // Initialize once; subsequent session updates are managed through sessionRef.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (disposeTimer.current !== null) window.clearTimeout(disposeTimer.current);
    return () => {
      // Delay one task so React StrictMode's development-only effect replay can cancel this.
      disposeTimer.current = window.setTimeout(() => {
        if (sessionRef.current.activeSegmentStartedAt) void pauseSession().catch(() => undefined);
      }, 0);
    };
  }, [pauseSession]);

  useEffect(() => {
    const checkpoint = window.setInterval(() => {
      const current = sessionRef.current;
      if (checkpointBusy.current || current.status !== 'in-progress' || !current.activeSegmentStartedAt) return;
      checkpointBusy.current = true;
      const end = new Date();
      void updateReviewSession(current.id, {
        activeSegments: [...current.activeSegments, { startedAt: current.activeSegmentStartedAt, endedAt: end.toISOString() }],
        activeSegmentStartedAt: end.toISOString(),
      }).then((updated) => setCurrentSession(updated)).catch(() => undefined).finally(() => { checkpointBusy.current = false; });
    }, 15_000);
    return () => window.clearInterval(checkpoint);
  }, [updateReviewSession]);

  useEffect(() => {
    const unsubscribe = window.maji?.app?.onPrepareClose(() => pauseSession().then(() => undefined).catch(() => undefined));
    return () => { unsubscribe?.(); };
  }, [pauseSession]);

  useEffect(() => { setAnswer(selectedQuestion?.answer ?? ''); setGradeRetry(Boolean(selectedQuestion?.answer && !selectedQuestion.grade)); }, [selectedQuestion?.id]);

  const gradeSavedAnswer = async (item: ReviewQuestion, savedAnswer: string): Promise<void> => {
    setBusy(true); setError('');
    try {
      const ai = window.maji?.ai;
      if (!ai) throw new Error('AI 评阅仅可在桌面版中使用。');
      const grade: ReviewGrade = await ai.review.grade({ question: item, answer: savedAnswer });
      const saved = await saveReviewGrade(sessionRef.current.id, { questionId: item.id, grade });
      const current = sessionRef.current;
      const updated = { ...current, questions: current.questions.map((candidate) => candidate.id === item.id ? saved : candidate) };
      setCurrentSession(updated); setGradeRetry(false);
      setQuestionIndex(Math.min(updated.questions.findIndex((candidate) => !candidate.grade) < 0 ? updated.questions.length - 1 : updated.questions.findIndex((candidate) => !candidate.grade), updated.questions.length - 1));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'AI 评阅失败。'); setGradeRetry(true);
    } finally { setBusy(false); }
  };

  const submitAnswer = async (): Promise<void> => {
    if (!selectedQuestion || !answer.trim() || busy) return;
    setBusy(true); setError('');
    try {
      const saved = await saveReviewAnswer(session.id, { questionId: selectedQuestion.id, answer: answer.trim() });
      const current = sessionRef.current;
      setCurrentSession({ ...current, questions: current.questions.map((candidate) => candidate.id === saved.id ? saved : candidate) });
      setGradeRetry(true);
      await gradeSavedAnswer(saved, answer.trim());
    } catch (cause) { setError(cause instanceof Error ? cause.message : '保存答案失败。'); }
    finally { setBusy(false); }
  };

  const finish = async (): Promise<void> => {
    setBusy(true); setError('');
    try {
      const current = sessionRef.current;
      const end = new Date();
      const patch = {
        status: 'completed' as const,
        endedAt: end.toISOString(),
        activeSegments: current.activeSegmentStartedAt ? [...current.activeSegments, { startedAt: current.activeSegmentStartedAt, endedAt: end.toISOString() }] : current.activeSegments,
        activeSegmentStartedAt: null,
      };
      const updated = await updateReviewSession(current.id, patch);
      setCurrentSession(updated); setActive(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '保存练习记录失败。'); }
    finally { setBusy(false); }
  };

  const applyLinkedAction = async (action: ReviewAction): Promise<void> => {
    const ids = [...new Set(session.sources.flatMap((source) => source.reviewItemIds))];
    setScheduleBusy(true); setError('');
    try {
      for (const id of ids) await applyReviewAction(id, action);
      setScheduleSaved(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '更新复习安排失败。'); }
    finally { setScheduleBusy(false); }
  };

  const back = async (): Promise<void> => {
    try { if (sessionRef.current.status === 'in-progress') await pauseSession(); onBack(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '保存计时失败，请重试'); }
  };

  if (session.questions.length === 0) return <section className={styles.sessionPage}><Button variant="ghost" icon={ArrowLeft} onClick={() => void back()}>返回复习</Button><p>这次练习没有生成题目。</p></section>;

  return (
    <section className={styles.sessionPage} aria-label="AI 练习答题">
        <header className={styles.runnerTop}>
        <Button variant="ghost" icon={ArrowLeft} onClick={() => void back()}>返回复习</Button>
        <div><strong>{isCompleted ? '本次练习已完成' : 'AI 每日练习'}</strong><div className={styles.runnerMeta}>{session.sources.map((source) => source.noteTitle).join('、')} · {formatReviewDuration(activeSeconds)}</div></div>
        {isCompleted ? <span>{gradedCount}/{session.questions.length} 题已评阅</span> : active ? <Button variant="secondary" icon={Pause} onClick={() => void pauseSession().then(() => setError('')).catch((cause) => setError(cause instanceof Error ? cause.message : '暂停练习失败'))}>暂停</Button> : <Button variant="secondary" icon={Play} onClick={() => void resumeSession().then(() => setError('')).catch((cause) => setError(cause instanceof Error ? cause.message : '恢复计时失败'))}>继续计时</Button>}
      </header>
      <div className={styles.runnerProgress}><span style={{ width: `${(gradedCount / session.questions.length) * 100}%` }} /></div>

      {isCompleted ? (
        <article className={styles.runnerCard}>
          <h2>本次练习已完成</h2>
          <p>共完成 {session.questions.length} 道题，活跃练习时间 {formatReviewDuration(activeSeconds)}。题目、答案和解析已保存，可在练习记录中查看。</p>
          <div className={styles.historyList}>{session.questions.map((item, index) => <details className={styles.sessionSource} key={item.id}><summary><span>{index + 1}. {item.title}</span><small>{item.grade ? `${item.grade.score} 分` : '未评阅'}</small></summary><p><strong>题目：</strong>{item.prompt}</p><p><strong>你的答案：</strong>{item.answer || '未作答'}</p>{item.grade ? <GradePanel grade={item.grade} /> : null}</details>)}</div>
          {!scheduleSaved ? <div className={styles.runnerActions}><Button variant="primary" icon={Check} loading={scheduleBusy} onClick={() => void applyLinkedAction('mastered')}>标记关联知识点为已掌握</Button><Button variant="secondary" icon={RotateCcw} loading={scheduleBusy} onClick={() => void applyLinkedAction('review-again')}>安排关联知识点再复习</Button></div> : <p role="status">已更新关联知识点的复习安排。</p>}
        </article>
      ) : selectedQuestion ? (
        <article className={styles.runnerCard}>
          <div className={styles.runnerTop}><div><span className={styles.runnerMeta}>第 {questionIndex + 1} / {session.questions.length} 题 · {typeLabel(selectedQuestion.type)} · {difficultyLabel(selectedQuestion.difficulty)}</span><h2>{selectedQuestion.title}</h2></div>{selectedQuestion.language !== 'text' ? <span className={styles.runnerMeta}>{selectedQuestion.language}</span> : null}</div>
          <div className={styles.runnerPrompt}>{selectedQuestion.prompt}</div>
          {selectedQuestion.type.startsWith('code-') ? <div className={styles.questionCode}>代码题 · {selectedQuestion.language}</div> : null}
          <label className={styles.sessionLabel} htmlFor="review-answer">你的答案</label>
          <textarea id="review-answer" className={styles.answerInput} value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder={selectedQuestion.type.startsWith('code-') ? '在这里编写或粘贴代码…' : '写下你的理解…'} disabled={busy || gradeRetry || Boolean(selectedQuestion.grade)} />
          {selectedQuestion.hint ? <details><summary>查看提示</summary><p>{selectedQuestion.hint}</p></details> : null}
          {selectedQuestion.grade ? <GradePanel grade={selectedQuestion.grade} /> : null}
          {error ? <p role="alert" className={styles.sessionError}>{error}</p> : null}
          <div className={styles.runnerActions}>
            <Button variant="secondary" icon={ChevronLeft} disabled={questionIndex === 0} onClick={() => setQuestionIndex((value) => value - 1)}>上一题</Button>
            {selectedQuestion.grade && questionIndex < session.questions.length - 1 ? <Button variant="secondary" icon={ChevronRight} onClick={() => setQuestionIndex((value) => value + 1)}>下一题</Button> : null}
            {selectedQuestion.grade && gradedCount === session.questions.length ? <Button variant="primary" icon={Check} loading={busy} onClick={() => void finish()}>完成本次练习</Button> : null}
            {!selectedQuestion.grade && gradeRetry ? <Button variant="primary" icon={RotateCcw} loading={busy} onClick={() => void gradeSavedAnswer(selectedQuestion, selectedQuestion.answer ?? answer)}>重试 AI 评阅</Button> : !selectedQuestion.grade ? <Button variant="primary" icon={Check} loading={busy} disabled={!answer.trim()} onClick={() => void submitAnswer()}>提交答案并查看解析</Button> : null}
          </div>
        </article>
      ) : null}
      {error && isCompleted ? <p role="alert" className={styles.sessionError}>{error}</p> : null}
    </section>
  );
}

function GradePanel({ grade }: { grade: ReviewGrade }): ReactElement {
  return <div className={styles.gradePanel}><h3>{grade.score} 分</h3><p>{grade.rationale}</p>{grade.omissions.length ? <p><strong>还可以补充：</strong>{grade.omissions.join('；')}</p> : null}<p>{grade.feedback}</p><details><summary>参考答案与解析</summary><pre>{grade.referenceAnswer}</pre><p>{grade.explanation}</p></details></div>;
}

function typeLabel(type: ReviewQuestion['type']): string { return ({ concept: '概念回忆', 'short-answer': '简答题', 'code-reading': '代码阅读', 'code-writing': '代码编写', 'code-fix': '代码修复' })[type]; }
function difficultyLabel(difficulty: ReviewQuestion['difficulty']): string { return ({ easy: '基础', medium: '进阶', hard: '挑战' })[difficulty]; }
