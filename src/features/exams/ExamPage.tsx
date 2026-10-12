import { useCallback, useEffect, useMemo, useState } from 'react';
import { ClipboardCheck, Plus, Save, Sparkles } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { EmptyState } from '../../components/ui/EmptyState';
import { examApi } from './repository';
import { useExamDraft } from './useExamDraft';
import {
  newExam,
  newQuestion,
  examSource,
  validateExam,
  validateQuestion,
  validateExamAIRequest,
  type ExamQuestion,
  type ExamRecord,
  type ExamAIRequest,
  type ExamAnalysis,
  type ExamTraining,
  type TrainingLevel,
} from '../../lib/exams';
import { QuestionEditor } from './QuestionEditor';
import { ProjectFiles } from './ProjectFiles';
import { AnalysisPanel } from './AnalysisPanel';
import { TrainingPanel } from './TrainingPanel';
import styles from './exam.module.css';
const wrong = (q: ExamQuestion) => ['wrong', 'partial', 'uncertain'].includes(q.status);
const statusNames = {
  unmarked: '未标记',
  wrong: '答错',
  partial: '部分正确',
  uncertain: '答对但不理解',
  correct: '已掌握',
};
export function ExamPage() {
  const api = useMemo(() => examApi(), []),
    state = useExamDraft(api);
  const [records, setRecords] = useState<ExamRecord[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState('');
  const [tab, setTab] = useState<'exams' | 'wrong' | 'training'>('exams'),
    [questionId, setQuestionId] = useState(''),
    [trainingId, setTrainingId] = useState('');
  const [fileId, setFileId] = useState(''),
    [line, setLine] = useState(0),
    [query, setQuery] = useState(''),
    [showAnalysis, setShowAnalysis] = useState(true);
  const [newOpen, setNewOpen] = useState(false),
    [title, setTitle] = useState(''),
    [pending, setPending] = useState<ExamAIRequest | null>(null),
    [busy, setBusy] = useState(false);
  const [level, setLevel] = useState<TrainingLevel>('basic'),
    [count, setCount] = useState(3),
    [topic, setTopic] = useState(''),
    [allExams, setAllExams] = useState(false);
  const [excludedQuestions, setExcludedQuestions] = useState<string[]>([]);
  const exam = state.draft,
    question = exam?.questions.find((q) => q.id === questionId) ?? exam?.questions[0],
    training = exam?.trainings.find((t) => t.id === trainingId) ?? exam?.trainings[0];
  const list = records.map((r) => (r.id === exam?.id ? exam : r));
  if (exam && !list.some((r) => r.id === exam.id)) list.unshift(exam);
  const allQuestions = list.flatMap((e) => e.questions),
    availableCandidates = (allExams ? allQuestions : (exam?.questions ?? [])).filter(wrong),
    candidates = availableCandidates.filter((q) => !excludedQuestions.includes(q.id));
  useEffect(() => {
    let alive = true;
    void api
      .list()
      .then(async (rows) => {
        if (!alive) return;
        setRecords(rows);
        if (rows[0]) await state.open(rows[0]);
      })
      .catch((cause) => setError(String(cause instanceof Error ? cause.message : cause)))
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [api, state.open]);
  useEffect(() => {
    if (!exam?.revision) return;
    void api
      .list()
      .then(setRecords)
      .catch(() => {});
  }, [api, exam?.revision]);
  const changeQuestion = useCallback(
    (patch: Partial<ExamQuestion>) =>
      state.edit((e) => ({
        ...e,
        questions: e.questions.map((q) =>
          q.id === questionId || (!questionId && q.id === e.questions[0]?.id)
            ? { ...q, ...patch }
            : q,
        ),
      })),
    [state.edit, questionId],
  );
  function fail(cause: unknown) {
    setError(cause instanceof Error ? cause.message : '操作失败，请重试');
  }
  async function selectExam(record: ExamRecord, qid = '') {
    try {
      await state.open(record.id === exam?.id ? exam : record);
      setQuestionId(
        qid || (tab === 'wrong' ? (state.getCurrent()?.questions.find(wrong)?.id ?? '') : ''),
      );
      setFileId('');
      setLine(0);
      setError('');
    } catch (cause) {
      fail(cause);
    }
  }
  async function create() {
    try {
      const saved = await api.save(newExam(title.trim() || '新考试'));
      await state.open(saved);
      setRecords((previous) => [saved, ...previous]);
      setQuestionId(saved.questions[0]?.id ?? '');
      setNewOpen(false);
      setTitle('');
    } catch (cause) {
      fail(cause);
    }
  }
  function prepare(operation: ExamAIRequest['operation']) {
    setError('');
    try {
      if (operation === 'train' && exam && exam.trainings.length + count > 300)
        throw new Error('当前考试最多保存 300 道训练题，请减少题量或创建新的考试记录');
      let questions: ExamQuestion[];
      if (operation === 'grade') {
        if (!training) throw new Error('请选择训练题');
        questions = [
          {
            ...newQuestion(),
            id: training.id,
            title: training.title,
            prompt: training.prompt,
            referenceAnswer: training.referenceAnswer,
            originalAnswer: training.answer,
            files: training.files,
          },
        ];
      } else questions = operation === 'analyze' ? (question ? [question] : []) : candidates;
      setPending(validateExamAIRequest({ operation, questions, level, count, topic }));
    } catch (cause) {
      fail(cause);
    }
  }
  async function runAI() {
    if (!pending || !exam) return;
    const request = pending,
      examId = exam.id,
      activeQuestion = question?.id,
      activeTraining = training?.id;
    setBusy(true);
    setError('');
    try {
      await state.save();
      const result = await api.analyze(request);
      if (state.getCurrent()?.id !== examId) throw new Error('考试已切换，本次结果未写入');
      if (request.operation === 'train') {
        const generated = result as ExamTraining[];
        state.edit((e) => validateExam({ ...e, trainings: [...e.trainings, ...generated] }));
        setTrainingId(generated[0]?.id ?? '');
        setTab('training');
      } else {
        const analysis = result as ExamAnalysis;
        if (request.operation === 'analyze')
          state.edit((e) => ({
            ...e,
            questions: e.questions.map((q) =>
              q.id === activeQuestion
                ? {
                    ...q,
                    analysis,
                    analyzedAt: new Date().toISOString(),
                    analysisSource: examSource(request.questions),
                  }
                : q,
            ),
          }));
        if (request.operation === 'weakness')
          state.edit((e) => ({
            ...e,
            weaknesses: analysis,
            weaknessesSource: examSource(request.questions),
          }));
        if (request.operation === 'grade')
          state.edit((e) => ({
            ...e,
            trainings: e.trainings.map((t) =>
              t.id === activeTraining
                ? { ...t, feedback: analysis, submittedAt: new Date().toISOString() }
                : t,
            ),
          }));
        setShowAnalysis(true);
      }
      await state.save();
      setPending(null);
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(false);
    }
  }
  const onReference = (qid: string, path: string, lineNumber: number) => {
    const owner = list.find((e) => e.questions.some((q) => q.id === qid));
    if (!owner) return;
    void selectExam(owner, qid).then(() => {
      setTab('exams');
      setFileId(
        owner.questions.find((q) => q.id === qid)?.files.find((f) => f.path === path)?.id ?? '',
      );
      setLine(lineNumber);
    });
  };
  const visibleQuestions = (exam?.questions ?? []).filter(
    (q) =>
      (tab !== 'wrong' || wrong(q)) &&
      `${q.title} ${q.prompt}`.toLowerCase().includes(query.toLowerCase()),
  );
  const masteryPanel = exam?.weaknesses && (
    <div className={styles.mastery} aria-label="知识点掌握情况">
      <h3>知识点掌握情况</h3>
      {exam.weaknesses.concepts.map((c) => {
        const attempts = exam.trainings.filter((t) => t.topic === c.name),
          passed = attempts.filter((t) => t.feedback?.assessment === 'correct').length;
        const suggested =
          passed >= 2
            ? '基本掌握'
            : passed === 1
              ? '待复查'
              : attempts.length
                ? '训练中'
                : '待补强';
        const override = exam.mastery.find((m) => m.name === c.name);
        return (
          <article key={c.name}>
            <button disabled={busy} onClick={() => setTopic(c.name)} title="针对这个知识点生成练习">
              {c.name}
            </button>
            <label>
              掌握状态
              <select
                aria-label={`${c.name}掌握状态`}
                disabled={busy}
                value={override?.state ?? suggested}
                onChange={(e) =>
                  state.edit((r) => ({
                    ...r,
                    mastery: [
                      ...r.mastery.filter((m) => m.name !== c.name),
                      {
                        name: c.name,
                        state: e.target.value as '待补强' | '训练中' | '基本掌握' | '待复查',
                      },
                    ],
                  }))
                }
              >
                {['待补强', '训练中', '基本掌握', '待复查'].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <small>
              {attempts.length} 次训练 · {passed} 次 AI 评阅正确 ·{' '}
              {attempts.reduce((sum, t) => sum + t.durationSeconds, 0)} 秒
            </small>
            {override && (
              <button
                disabled={busy}
                onClick={() =>
                  state.edit((r) => ({ ...r, mastery: r.mastery.filter((m) => m.name !== c.name) }))
                }
              >
                恢复自动建议
              </button>
            )}
          </article>
        );
      })}
      <p>状态依据该知识点的训练结果提供建议，可手动修改；AI 评阅不等同于实际运行验证。</p>
    </div>
  );
  const analysis = tab === 'wrong' ? exam?.weaknesses : question?.analysis;
  const stale =
    analysis &&
    (tab === 'wrong'
      ? exam?.weaknessesSource !== examSource(candidates)
      : question?.analysisSource !== examSource(question ? [question] : []));
  return (
    <section className={styles.page} data-scroll-container aria-label="考试与错题">
      <header className={styles.header}>
        <div>
          <h1>
            <ClipboardCheck size={25} />
            考试与错题
          </h1>
          <p>整理题目与项目代码，找出薄弱点，再通过训练验证理解。</p>
        </div>
        <div className={styles.actions}>
          <span role="status">{state.status}</span>
          <Button
            icon={Save}
            variant="secondary"
            disabled={busy}
            onClick={() => void state.save().catch(fail)}
          >
            保存
          </Button>
          <Button icon={Plus} disabled={busy} onClick={() => setNewOpen(true)}>
            新增考试
          </Button>
        </div>
      </header>
      <nav className={styles.tabs} aria-label="考试页面">
        <button disabled={busy} aria-pressed={tab === 'exams'} onClick={() => setTab('exams')}>
          考试记录
        </button>
        <button
          disabled={busy}
          aria-pressed={tab === 'wrong'}
          onClick={() => {
            setTab('wrong');
            setQuestionId(exam?.questions.find(wrong)?.id ?? '');
          }}
        >
          错题库 · {allQuestions.filter(wrong).length}
        </button>
        <button
          disabled={busy}
          aria-pressed={tab === 'training'}
          onClick={() => setTab('training')}
        >
          强化训练
        </button>
      </nav>
      {(error || state.error) && (
        <p role="alert" className={styles.error}>
          {error || state.error}
        </p>
      )}
      {loading ? (
        <p>正在读取考试…</p>
      ) : !exam ? (
        <EmptyState
          icon={ClipboardCheck}
          title="还没有考试记录"
          description="先整理一份考试题目和自己的答案，项目题可附多个文件。"
          actions={<Button onClick={() => setNewOpen(true)}>新增考试</Button>}
        />
      ) : (
        <div className={styles.workbench}>
          <aside className={styles.sidebar} aria-label="考试题目目录">
            <label>
              选择考试
              <select
                aria-label="选择考试"
                disabled={busy}
                value={exam.id}
                onChange={(e) => {
                  const record = list.find((r) => r.id === e.target.value);
                  if (record) void selectExam(record);
                }}
              >
                {[...list]
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.date} · {e.title}
                    </option>
                  ))}
              </select>
            </label>
            <input
              aria-label="搜索题目"
              placeholder="搜索题目…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {tab === 'training'
              ? exam.trainings.map((t) => (
                  <button
                    disabled={busy}
                    key={t.id}
                    aria-pressed={t.id === training?.id}
                    onClick={() => setTrainingId(t.id)}
                  >
                    {t.title}
                    <small>
                      {t.submittedAt ? '已提交' : '待作答'} · {t.durationSeconds} 秒
                    </small>
                  </button>
                ))
              : visibleQuestions.map((q, i) => (
                  <button
                    disabled={busy}
                    key={q.id}
                    aria-pressed={q.id === question?.id}
                    onClick={() => {
                      setQuestionId(q.id);
                      setFileId('');
                      setLine(0);
                    }}
                  >
                    {i + 1}. {q.title}
                    <small>{statusNames[q.status]}</small>
                  </button>
                ))}
            {tab !== 'training' && (
              <button
                disabled={busy || exam.questions.length >= 100}
                onClick={() => {
                  const q = newQuestion();
                  state.edit((e) => ({ ...e, questions: [...e.questions, q] }));
                  setQuestionId(q.id);
                  setFileId('');
                }}
              >
                ＋ 新增题目
              </button>
            )}
            {tab === 'wrong' && <p>选择考试查看其错题。弱项分析可选择覆盖所有考试。</p>}
          </aside>
          <main className={styles.main}>
            <fieldset className={styles.examMeta} disabled={busy}>
              <label>
                考试名称
                <input
                  aria-label="考试名称"
                  value={exam.title}
                  onChange={(e) => state.edit((r) => ({ ...r, title: e.target.value }))}
                />
              </label>
              <label>
                考试日期
                <input
                  aria-label="考试日期"
                  type="date"
                  value={exam.date}
                  onChange={(e) => state.edit((r) => ({ ...r, date: e.target.value }))}
                />
              </label>
              <label>
                课程 / 科目
                <input
                  aria-label="考试课程"
                  value={exam.course}
                  onChange={(e) => state.edit((r) => ({ ...r, course: e.target.value }))}
                />
              </label>
              <label>
                考试备注
                <input
                  aria-label="考试备注"
                  value={exam.remarks}
                  onChange={(e) => state.edit((r) => ({ ...r, remarks: e.target.value }))}
                />
              </label>
            </fieldset>
            {tab === 'wrong' && (
              <div className={styles.trainingSetup}>
                <h2>弱项分析与针对性训练</h2>
                <label>
                  <input
                    type="checkbox"
                    checked={allExams}
                    disabled={busy}
                    onChange={(e) => setAllExams(e.target.checked)}
                  />
                  分析所有考试的错题
                </label>
                <p>已选 {candidates.length} 道错题；单题证据仅视为疑似弱项。</p>
                <details>
                  <summary>选择参与分析的错题（单次最多 30 道）</summary>
                  {availableCandidates.length > 30 && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        setExcludedQuestions(availableCandidates.slice(30).map((q) => q.id))
                      }
                    >
                      只选前 30 道
                    </button>
                  )}
                  {availableCandidates.map((q) => (
                    <label key={q.id}>
                      <input
                        type="checkbox"
                        disabled={busy}
                        aria-label={`${q.title}参与弱项分析`}
                        checked={!excludedQuestions.includes(q.id)}
                        onChange={(e) =>
                          setExcludedQuestions((previous) =>
                            e.target.checked
                              ? previous.filter((id) => id !== q.id)
                              : [...previous, q.id],
                          )
                        }
                      />
                      {q.title}
                    </label>
                  ))}
                </details>
                <Button
                  icon={Sparkles}
                  disabled={busy || !candidates.length}
                  onClick={() => prepare('weakness')}
                >
                  分析我的弱项
                </Button>
                <div className={styles.meta}>
                  <label>
                    训练层次
                    <select
                      aria-label="训练层次"
                      value={level}
                      onChange={(e) => setLevel(e.target.value as TrainingLevel)}
                      disabled={busy}
                    >
                      <option value="basic">基础理解</option>
                      <option value="repair">定点修复</option>
                      <option value="project">综合应用（多层项目）</option>
                    </select>
                  </label>
                  <label>
                    题量
                    <select
                      aria-label="训练题量"
                      value={count}
                      disabled={busy}
                      onChange={(e) => setCount(Number(e.target.value))}
                    >
                      {[1, 2, 3, 4, 5, 6].map((n) => (
                        <option key={n}>{n}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    针对知识点
                    <input
                      aria-label="训练知识点"
                      value={topic}
                      disabled={busy}
                      placeholder="可选：如依赖注入"
                      onChange={(e) => setTopic(e.target.value)}
                    />
                  </label>
                </div>
                <Button disabled={busy || !candidates.length} onClick={() => prepare('train')}>
                  生成强化训练
                </Button>
                {masteryPanel}
              </div>
            )}
            {tab === 'training' ? (
              training ? (
                <TrainingPanel
                  key={training.id}
                  training={training}
                  questions={allQuestions}
                  disabled={busy}
                  onGrade={() => prepare('grade')}
                  onChange={(patch) =>
                    state.edit((e) => ({
                      ...e,
                      trainings: e.trainings.map((t) =>
                        t.id === training.id ? { ...t, ...patch } : t,
                      ),
                    }))
                  }
                />
              ) : (
                <p>暂无训练题。在错题库选择弱项和训练层次后生成。</p>
              )
            ) : question && (tab !== 'wrong' || wrong(question)) ? (
              <>
                <div className={styles.actions}>
                  <label>
                    错题状态
                    <select
                      aria-label="错题状态"
                      disabled={busy}
                      value={question.status}
                      onChange={(e) =>
                        changeQuestion({ status: e.target.value as ExamQuestion['status'] })
                      }
                    >
                      {Object.entries(statusNames).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button
                    icon={Sparkles}
                    disabled={busy || !question.prompt.trim()}
                    onClick={() => prepare('analyze')}
                  >
                    AI 分析解题步骤
                  </Button>
                  <button onClick={() => setShowAnalysis((v) => !v)}>
                    {showAnalysis ? '收起解析' : '展开解析'}
                  </button>
                </div>
                <QuestionEditor
                  key={question.id}
                  question={question}
                  disabled={busy}
                  onChange={changeQuestion}
                />
                <ProjectFiles
                  key={question.id}
                  files={question.files}
                  selected={fileId}
                  line={line}
                  disabled={busy}
                  onSelect={(id) => {
                    setFileId(id);
                    setLine(0);
                  }}
                  onChange={(files) => changeQuestion({ files })}
                  onAppend={(files) =>
                    state.edit((e) => {
                      if (e.id !== exam.id) throw new Error('考试已切换，请重新导入');
                      return {
                        ...e,
                        questions: e.questions.map((q) =>
                          q.id === question.id
                            ? validateQuestion({ ...q, files: [...q.files, ...files] })
                            : q,
                        ),
                      };
                    })
                  }
                />
              </>
            ) : (
              <p>当前考试没有符合筛选的错题。</p>
            )}
          </main>
          {tab !== 'training' && showAnalysis && (
            <aside className={styles.aiPanel} aria-label="AI 考试解析">
              <h2>{tab === 'wrong' ? '弱项分析' : 'AI 解题分析'}</h2>
              {stale && (
                <p className={styles.error}>题目、答案或文件已修改，这份分析需要重新生成。</p>
              )}
              {analysis ? (
                <AnalysisPanel
                  analysis={analysis}
                  questions={allQuestions}
                  onReference={onReference}
                />
              ) : (
                <p>由你发起分析，结果独立保存，不覆盖原始答案。代码分析会注明引用与缺失信息。</p>
              )}
            </aside>
          )}
        </div>
      )}
      <Modal
        open={newOpen}
        title="新增考试"
        onClose={() => setNewOpen(false)}
        footer={<Button onClick={() => void create()}>创建考试</Button>}
      >
        <label className={styles.dialogForm}>
          考试名称
          <input
            autoFocus
            aria-label="新考试名称"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例如：Spring Boot 阶段考试"
          />
        </label>
      </Modal>
      <Modal
        open={!!pending}
        wide
        title="确认 AI 分析范围"
        onClose={() => {
          if (!busy) setPending(null);
        }}
        description="题干、答案及下面列出的代码会发送给设置中的 AI 服务商。仅发送已选文件正文，未选文件只提供路径和层级。图片需补充文字描述。不要包含密钥、私人资料或无关项目文件。"
        footer={
          <>
            <Button variant="secondary" disabled={busy} onClick={() => setPending(null)}>
              取消
            </Button>
            <Button disabled={busy} onClick={() => void runAI()}>
              {busy ? 'AI 正在分析…' : '确认发送'}
            </Button>
          </>
        }
      >
        {pending && (
          <>
            <p>
              操作：
              {
                {
                  analyze: '解题分析',
                  weakness: '弱项分析',
                  train: '生成强化训练',
                  grade: '答案评阅',
                }[pending.operation]
              }{' '}
              · {pending.questions.length} 道题 · {examSource(pending.questions).length} 字符
            </p>
            <div className={styles.sendPreview}>
              {pending.questions.map((q) => (
                <details key={q.id} open>
                  <summary>
                    {q.title} · {q.files.filter((f) => f.includeInAI !== false).length} 个已选文件
                  </summary>
                  <pre>{q.prompt}</pre>
                  <p>我的答案：{q.originalAnswer || '未填写'}</p>
                  {pending.operation !== 'grade' && (
                    <p>参考答案：{q.referenceAnswer || '未提供'}</p>
                  )}
                  {q.files
                    .filter((f) => f.includeInAI !== false)
                    .map((f) => (
                      <details key={f.id}>
                        <summary>
                          {f.path} · {f.role} · {f.content.length} 字符
                        </summary>
                        <pre>{f.content}</pre>
                      </details>
                    ))}
                </details>
              ))}
            </div>
          </>
        )}
        {error && <p role="alert">{error}</p>}
      </Modal>
    </section>
  );
}
