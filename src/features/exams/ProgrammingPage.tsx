import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ROUTES } from '../../app/routes';
import { Code2, Plus, Save, Sparkles } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { examApi } from './repository';
import { useExamDraft } from './useExamDraft';
import { ProgrammingPrompt } from './ProgrammingPrompt';
import { ProjectFiles } from './ProjectFiles';
import { AnalysisPanel } from './AnalysisPanel';
import { newProgrammingModule } from '../../lib/programmingModules';
import {
  examSource,
  validateExam,
  validateQuestion,
  validateExamAIRequest,
  validateExamAIResult,
  questionContext,
  type ExamRecord,
  type ExamQuestion,
  type ExamAIRequest,
  type ExamAnalysis,
} from '../../lib/exams';
import styles from './exam.module.css';
export function ProgrammingPage() {
  const api = useMemo(() => examApi(), []),
    state = useExamDraft(api);
  const [records, setRecords] = useState<ExamRecord[]>([]),
    [questionId, setQuestionId] = useState(''),
    [fileId, setFileId] = useState(''),
    [line, setLine] = useState(0);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [query, setQuery] = useState(''),
    [newOpen, setNewOpen] = useState(false),
    [name, setName] = useState('');
  const [busy, setBusy] = useState(false),
    [importing, setImporting] = useState(false),
    [switching, setSwitching] = useState(false),
    [pending, setPending] = useState<ExamAIRequest | null>(null);
  const mounted = useRef(true),
    switchToken = useRef(0);
  const record = state.draft,
    question = record?.questions.find((q) => q.id === questionId) ?? record?.questions[0];
  const combined = records.map((r) => (r.id === record?.id ? record : r));
  if (record && !combined.some((r) => r.id === record.id)) combined.unshift(record);
  const modules = combined.flatMap((r) =>
    r.questions
      .filter((q) => r.kind === 'programming' || q.files.length > 0 || /项目|代码/.test(q.type))
      .map((q) => ({ record: r, question: q })),
  );
  const disabled = loading || busy || importing || switching;
  const fail = (cause: unknown) =>
    setError(cause instanceof Error ? cause.message : '操作失败，请重试');
  useEffect(() => {
    mounted.current = true;
    let active = true;
    void api
      .list()
      .then(async (rows) => {
        if (!active) return;
        setRecords(rows);
        const last = localStorage.getItem('maji:programming:last-question');
        const choices = rows.flatMap((r) =>
          r.questions
            .filter(
              (q) => r.kind === 'programming' || q.files.length > 0 || /项目|代码/.test(q.type),
            )
            .map((q) => ({ record: r, question: q })),
        );
        const first = choices.find((m) => m.question.id === last) ?? choices[0];
        if (first) {
          await state.open(first.record);
          if (active) setQuestionId(first.question.id);
        }
      })
      .catch(fail)
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      mounted.current = false;
    };
  }, [api, state.open]);
  useEffect(() => {
    if (!record?.revision) return;
    void api
      .list()
      .then((rows) => {
        if (mounted.current) setRecords(rows);
      })
      .catch(() => {});
  }, [api, record?.revision]);
  useEffect(() => {
    if (question)
      try {
        localStorage.setItem('maji:programming:last-question', question.id);
      } catch {
        /* Selection is optional. */
      }
  }, [question?.id]);
  const editQuestion = useCallback(
    (patch: Partial<ExamQuestion>) => {
      if (!question) return;
      const owner = record?.id,
        target = question.id;
      state.edit((r) => {
        if (r.id !== owner) throw new Error('模块已切换，请重新操作');
        return {
          ...r,
          title: r.questions.length === 1 && patch.title?.trim() ? patch.title : r.title,
          questions: r.questions.map((q) => (q.id === target ? { ...q, ...patch } : q)),
        };
      });
    },
    [state.edit, question?.id, record?.id],
  );
  async function selectModule(owner: ExamRecord, id: string) {
    if (disabled) return;
    const token = ++switchToken.current;
    setSwitching(true);
    setError('');
    try {
      await state.open(owner);
      if (token !== switchToken.current || !mounted.current) return;
      setQuestionId(id);
      setFileId('');
      setLine(0);
    } catch (cause) {
      fail(cause);
    } finally {
      if (mounted.current) setSwitching(false);
    }
  }
  async function create() {
    setBusy(true);
    setError('');
    try {
      const value = name.trim();
      if (!value) throw new Error('请填写模块名称');
      await state.save();
      const saved = await api.save(newProgrammingModule(value));
      await state.open(saved);
      setRecords((rows) => [saved, ...rows.filter((row) => row.id !== saved.id)]);
      setQuestionId(saved.questions[0]!.id);
      setFileId('');
      setLine(0);
      setNewOpen(false);
      setName('');
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(false);
    }
  }
  function prepare() {
    setError('');
    try {
      if (!question) throw new Error('请选择模块');
      if (!question.prompt.trim()) throw new Error('请先填写编程题要求');
      setPending(
        validateExamAIRequest({
          operation: 'analyze',
          questions: [question],
          level: 'basic',
          count: 1,
        }),
      );
    } catch (cause) {
      fail(cause);
    }
  }
  async function analyze() {
    if (!pending || !record || !question) return;
    const request = pending,
      owner = record.id,
      target = question.id;
    setBusy(true);
    setError('');
    try {
      await state.save();
      const result = validateExamAIResult(await api.analyze(request), request) as ExamAnalysis;
      if (!mounted.current) return;
      if (state.getCurrent()?.id !== owner) throw new Error('模块已切换，本次分析未写入');
      state.edit((r) =>
        validateExam({
          ...r,
          questions: r.questions.map((q) =>
            q.id === target
              ? {
                  ...q,
                  analysis: result,
                  analysisSource: examSource(request.questions),
                  analyzedAt: new Date().toISOString(),
                }
              : q,
          ),
        }),
      );
      await state.save();
      setPending(null);
    } catch (cause) {
      if (mounted.current) fail(cause);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  const analysis = question?.analysis,
    stale = !!analysis && question?.analysisSource !== examSource(question ? [question] : []);
  const selectedFiles = pending ? questionContext(pending.questions[0]!).files : [];
  return (
    <section
      className={`${styles.page} ${styles.programming}`}
      data-scroll-container
      aria-label="编程题分析"
    >
      <header className={styles.header}>
        <div>
          <h1>
            <Code2 size={25} />
            编程题分析
          </h1>
          <p>一道题一个模块：自己命名、分类和导入，代码与解析互不混用。</p>
        </div>
        <div className={styles.actions}>
          <span role="status">{state.status}</span>
          <Button
            icon={Save}
            disabled={disabled}
            variant="secondary"
            onClick={() => void state.save().catch(fail)}
          >
            保存
          </Button>
          <Button
            icon={Plus}
            disabled={disabled}
            onClick={() => {
              setNewOpen(true);
              setName('');
            }}
          >
            新增模块
          </Button>
        </div>
      </header>
      <div className={styles.moduleNotice}>
        <span>只分析当前模块，其他模块内容不会发送。</span>
        <Link
          to={ROUTES.examsHistory}
          onClick={(e) => {
            if (disabled) e.preventDefault();
          }}
        >
          查看历史考试与训练
        </Link>
      </div>
      {(error || state.error) && (
        <p role="alert" className={styles.error}>
          {error || state.error}
        </p>
      )}
      {loading ? (
        <p>正在读取编程题模块…</p>
      ) : (
        <div className={styles.programmingLayout}>
          <aside className={styles.sidebar} aria-label="编程题模块目录">
            <input
              aria-label="搜索模块"
              placeholder="搜索模块…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {modules
              .filter((m) => m.question.title.toLowerCase().includes(query.toLowerCase()))
              .map((m) => (
                <button
                  key={m.question.id}
                  aria-pressed={m.record.id === record?.id && m.question.id === question?.id}
                  disabled={disabled}
                  onClick={() => void selectModule(m.record, m.question.id)}
                >
                  <strong>{m.question.title || '未命名模块'}</strong>
                  <small>
                    {m.question.files.length} 个文件 · {m.question.analysis ? '已有解析' : '待分析'}
                  </small>
                </button>
              ))}
            {!modules.length && <p>先新增一个编程题模块。</p>}
          </aside>
          {question && record ? (
            <main className={styles.moduleMain}>
              <section className={styles.moduleHeader}>
                <label>
                  模块名称
                  <input
                    aria-label="模块名称"
                    maxLength={200}
                    value={question.title}
                    disabled={disabled}
                    onChange={(e) => editQuestion({ title: e.target.value })}
                  />
                </label>
                <div className={styles.actions}>
                  <span className={styles.badge}>独立模块 · {question.files.length} 个文件</span>
                  <Button
                    icon={Sparkles}
                    disabled={disabled || !question.prompt.trim()}
                    onClick={prepare}
                  >
                    {busy ? 'AI 正在分析…' : '分析当前模块'}
                  </Button>
                </div>
              </section>
              <section className={styles.main}>
                <ProgrammingPrompt
                  key={question.id}
                  question={question}
                  disabled={disabled}
                  onChange={editQuestion}
                />
              </section>
              <section className={styles.main}>
                <ProjectFiles
                  key={question.id}
                  files={question.files}
                  categories={question.categories ?? []}
                  selected={fileId}
                  line={line}
                  disabled={disabled}
                  onImporting={setImporting}
                  onSelect={(id) => {
                    setFileId(id);
                    setLine(0);
                  }}
                  onChange={(files) => editQuestion({ files })}
                  onCategoriesChange={(categories, files) => editQuestion({ categories, files })}
                  onAppend={(files) =>
                    state.edit((r) => {
                      if (r.id !== record.id) throw new Error('模块已切换，请重新导入');
                      return {
                        ...r,
                        questions: r.questions.map((q) =>
                          q.id === question.id
                            ? validateQuestion({ ...q, files: [...q.files, ...files] })
                            : q,
                        ),
                      };
                    })
                  }
                />
              </section>
              <section className={styles.main} aria-label="当前模块解析">
                <div className={styles.actions}>
                  <h2>解题步骤与答案</h2>
                  {question.analyzedAt && (
                    <small>{new Date(question.analyzedAt).toLocaleString('zh-CN')}</small>
                  )}
                </div>
                {stale && (
                  <p className={styles.error}>模块内容已修改，请重新分析；下面保留的是上次结果。</p>
                )}
                {analysis ? (
                  <AnalysisPanel
                    programmingOnly
                    analysis={analysis}
                    questions={[question]}
                    onReference={(qid, path, lineNumber) => {
                      if (qid !== question.id) return;
                      const file = question.files.find((f) => f.path === path);
                      if (file) {
                        setFileId(file.id);
                        setLine(lineNumber);
                      } else setError('引用文件已改名或移除，请重新分析');
                    }}
                  />
                ) : (
                  <p className={styles.muted}>
                    先填写题目要求，按分类导入代码，再分析当前模块。结果只保存在这里。
                  </p>
                )}
              </section>
            </main>
          ) : (
            <EmptyState
              icon={Code2}
              title="新增一道编程题"
              description="例如部门管理、员工查询或登录接口，每道题都有自己的文件与解析。"
              actions={
                <Button disabled={disabled} onClick={() => setNewOpen(true)}>
                  新增模块
                </Button>
              }
            />
          )}
        </div>
      )}
      <Modal
        open={newOpen}
        title="新增编程题模块"
        onClose={() => {
          if (!busy) setNewOpen(false);
        }}
        footer={
          <Button disabled={busy || !name.trim()} onClick={() => void create()}>
            创建模块
          </Button>
        }
      >
        <label className={styles.dialogForm}>
          模块名称
          <input
            autoFocus
            aria-label="新模块名称"
            maxLength={200}
            value={name}
            disabled={busy}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：部门管理 CRUD"
          />
        </label>
        {error && <p role="alert">{error}</p>}
      </Modal>
      <Modal
        open={!!pending}
        wide
        title="确认当前模块分析范围"
        onClose={() => {
          if (!busy) setPending(null);
        }}
        description="只发送当前模块的题目、参考答案、解题思路及已选文件。未选文件只发送分类目录；不会读取其他模块。"
        footer={
          <>
            <Button variant="secondary" disabled={busy} onClick={() => setPending(null)}>
              取消
            </Button>
            <Button disabled={busy} onClick={() => void analyze()}>
              {busy ? '正在分析…' : '确认发送'}
            </Button>
          </>
        }
      >
        {pending && (
          <div className={styles.sendPreview}>
            <h3>{pending.questions[0]!.title}</h3>
            <p>
              {selectedFiles.length} 个已选文件 · {examSource(pending.questions).length} 字符
            </p>
            <pre>{pending.questions[0]!.prompt}</pre>
            <details>
              <summary>参考答案与解题思路</summary>
              <pre>{pending.questions[0]!.referenceAnswer || '未提供参考答案'}</pre>
              <pre>{pending.questions[0]!.originalAnswer || '未填写解题思路'}</pre>
            </details>
            {selectedFiles.map((f) => (
              <details key={f.path}>
                <summary>
                  {f.role} / {f.path}
                </summary>
                <pre>{f.content}</pre>
              </details>
            ))}
          </div>
        )}
        {error && <p role="alert">{error}</p>}
      </Modal>
    </section>
  );
}
