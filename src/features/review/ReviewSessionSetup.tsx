import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { ArrowLeft, BookOpen, Check, Sparkles } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Tag } from '../../components/ui/Tag';
import { isDueNow } from '../../lib/review';
import type {
  Course,
  GeneratedReviewQuestion,
  LanguageId,
  Note,
  NoteSummary,
  ReviewDepth,
  ReviewGenerationInput,
  ReviewItemWithNote,
  ReviewSessionInput,
  ReviewSessionWithQuestions,
} from '../../lib/types';
import styles from './review.module.css';
import type { MindMapReviewPreset } from '../mindmap/reviewPreset';

type Scope = ReviewSessionInput['scope'];
type AIStatus = 'loading' | 'ready' | 'missing' | 'unavailable' | 'error';

const DEPTH_COUNTS: Record<ReviewDepth, number> = { quick: 3, standard: 5, deep: 8 };
const MAX_SOURCES = 12;
const MAX_SOURCE_UNITS = 12_000;
const MAX_TOTAL_UNITS = 48_000;

export interface ReviewSessionSetupProps {
  preset?: MindMapReviewPreset | null;
  notes: NoteSummary[];
  courses: Course[];
  reviews: ReviewItemWithNote[];
  loadNote(id: string): Promise<Note | null>;
  onBack(): void;
  onCreate(input: ReviewSessionInput): Promise<ReviewSessionWithQuestions>;
  onStarted(session: ReviewSessionWithQuestions): void;
}

export function ReviewSessionSetup({
  preset,
  notes,
  courses,
  reviews,
  loadNote,
  onBack,
  onCreate,
  onStarted,
}: ReviewSessionSetupProps): ReactElement {
  const api = window.maji?.ai;
  const [status, setStatus] = useState<AIStatus>(api ? 'loading' : 'unavailable');
  const [scope, setScope] = useState<Scope>(preset ? 'notes' : 'due');
  const [courseId, setCourseId] = useState(courses[0]?.id ?? '');
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);
  const [depth, setDepth] = useState<ReviewDepth>('standard');
  const [questionCount, setQuestionCount] = useState(DEPTH_COUNTS.standard);
  const [preview, setPreview] = useState<ReviewGenerationInput | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!api) return;
    let active = true;
    void api.getSettings().then((settings) => {
      if (active) setStatus(settings.configured ? 'ready' : 'missing');
    }).catch(() => {
      if (active) setStatus('error');
    });
    return () => { active = false; };
  }, [api]);

  const dueReviews = useMemo(() => reviews.filter((item) => isDueNow(item)), [reviews]);
  const candidateNotes = useMemo(() => {
    if (scope === 'due') {
      const ids = new Set(dueReviews.map((item) => item.noteId));
      return notes.filter((note) => ids.has(note.id) && !note.archived);
    }
    if (scope === 'course') return notes.filter((note) => note.courseId === courseId && !note.archived);
    return notes.filter((note) => !note.archived);
  }, [courseId, dueReviews, notes, scope]);

  useEffect(() => {
    if (scope !== 'notes' || selectedNoteIds.length > 0) return;
    const first = candidateNotes[0];
    if (first) setSelectedNoteIds([first.id]);
  }, [candidateNotes, scope, selectedNoteIds.length]);

  const onDepthChange = (value: ReviewDepth): void => {
    setDepth(value);
    setQuestionCount(DEPTH_COUNTS[value]);
    setPreview(null);
  };

  const toggleNote = (id: string): void => {
    setSelectedNoteIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    setPreview(null);
  };

  const selectedIds = useMemo(() => {
    if (scope === 'due') return [...new Set(dueReviews.map((item) => item.noteId))];
    if (scope === 'course') return candidateNotes.map((note) => note.id);
    return selectedNoteIds;
  }, [candidateNotes, dueReviews, scope, selectedNoteIds]);

  const loadSources = async (): Promise<ReviewGenerationInput> => {
    if (preset) return { sources: preset.sources, language: preset.language, depth, count: questionCount };
    if (selectedIds.length === 0) throw new Error('先选择至少一篇笔记或一个待复习知识点。');
    if (selectedIds.length > MAX_SOURCES) throw new Error(`一次最多选择 ${MAX_SOURCES} 篇笔记，请缩小范围。`);
    const sourceSnapshots: ReviewGenerationInput['sources'] = [];
    let remaining = MAX_TOTAL_UNITS;
    for (const noteId of selectedIds) {
      const summary = notes.find((item) => item.id === noteId);
      const note = await loadNote(noteId);
      if (!summary || !note || note.archived) continue;
      const contentExcerpt = note.contentText.slice(0, Math.min(MAX_SOURCE_UNITS, remaining)).trim();
      if (!contentExcerpt) continue;
      remaining -= contentExcerpt.length;
      sourceSnapshots.push({
        noteId,
        noteTitle: summary.title,
        courseName: summary.courseName,
        contentExcerpt,
        reviewItemIds: scope === 'due'
          ? dueReviews.filter((item) => item.noteId === noteId).map((item) => item.id)
          : reviews.filter((item) => item.noteId === noteId).map((item) => item.id),
      });
      if (remaining <= 0) break;
    }
    if (sourceSnapshots.length === 0) throw new Error('所选笔记没有可用于出题的正文内容。');
    return {
      sources: sourceSnapshots,
      depth,
      count: questionCount,
      language: sharedLanguage(sourceSnapshots.map((source) => notes.find((item) => item.id === source.noteId)?.language ?? 'text')),
    };
  };

  const showPreview = async (): Promise<void> => {
    setLoadingPreview(true);
    setError('');
    try {
      setPreview(await loadSources());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '读取笔记失败');
    } finally {
      setLoadingPreview(false);
    }
  };

  const generate = async (): Promise<void> => {
    if (status === 'missing') {
      window.dispatchEvent(new Event('maji:open-ai-settings'));
      return;
    }
    if (!api || !preview) return;
    setGenerating(true);
    setError('');
    try {
      const questions: GeneratedReviewQuestion[] = await api.review.generate(preview);
      const session = await onCreate({
        scope,
        depth,
        plannedQuestionCount: questionCount,
        sources: preview.sources,
        questions,
      });
      onStarted(session);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '生成练习失败，请重试');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <section className={styles.sessionPage} aria-labelledby="ai-review-title">
      <div className={styles.sessionHeader}>
        <Button variant="ghost" icon={ArrowLeft} onClick={onBack}>返回复习</Button>
        <div>
          <h2 id="ai-review-title">AI 每日练习</h2>
          {preset && <p>导图复习范围：{preset.title}。生成内容来自选中的分支快照，计时与结果保存在现有练习记录中。</p>}
          <p>按你的课程笔记出题，完成后会保存用时、内容范围和掌握情况。</p>
        </div>
      </div>

      {status === 'unavailable' ? (
        <div className={styles.sessionNotice} role="status">AI 练习需要在桌面版中使用；笔记与复习记录仍保存在本机。</div>
      ) : null}
      {status === 'error' ? <div className={styles.sessionError} role="alert">读取 AI 设置失败，请稍后重试。</div> : null}
      {status === 'missing' ? (
        <div className={styles.sessionNotice}>
          <span>先配置 OpenAI 兼容的 AI 服务，再开始生成练习。</span>
          <Button variant="secondary" onClick={() => window.dispatchEvent(new Event('maji:open-ai-settings'))}>配置 AI 服务</Button>
        </div>
      ) : null}

      <div className={styles.sessionSetupGrid}>
        <div className={styles.sessionSetupControls}>
          <label className={styles.sessionLabel} htmlFor="review-scope">练习范围</label>
          <select id="review-scope" disabled={!!preset} className={styles.sessionSelect} value={scope} onChange={(event) => { setScope(event.target.value as Scope); setPreview(null); }}>
            <option value="due">今日待复习知识点</option>
            <option value="course">选择课程</option>
            <option value="notes">{preset ? '选中导图分支' : '选择笔记'}</option>
          </select>

          {scope === 'course' ? (
            <>
              <label className={styles.sessionLabel} htmlFor="review-course">课程</label>
              <select id="review-course" className={styles.sessionSelect} value={courseId} onChange={(event) => { setCourseId(event.target.value); setPreview(null); }}>
                {courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
              </select>
            </>
          ) : null}

          {scope === 'notes' && !preset ? (
            <fieldset className={styles.sessionNotePicker}>
              <legend>选择笔记</legend>
              {candidateNotes.map((note) => (
                <label key={note.id} className={styles.sessionCheckbox}>
                  <input type="checkbox" checked={selectedNoteIds.includes(note.id)} onChange={() => toggleNote(note.id)} />
                  <span>{note.title}<small>{note.courseName}</small></span>
                </label>
              ))}
              {candidateNotes.length === 0 ? <p>还没有可选择的笔记。</p> : null}
            </fieldset>
          ) : null}

          <label className={styles.sessionLabel} htmlFor="review-depth">练习深度</label>
          <select id="review-depth" className={styles.sessionSelect} value={depth} onChange={(event) => onDepthChange(event.target.value as ReviewDepth)}>
            <option value="quick">快速 · 基础回忆</option>
            <option value="standard">标准 · 概念与代码</option>
            <option value="deep">深入 · 综合应用</option>
          </select>
          <label className={styles.sessionLabel} htmlFor="review-count">题目数量</label>
          <input id="review-count" className={styles.sessionSelect} type="number" min={1} max={12} value={questionCount} onChange={(event) => { const count = Number(event.target.value); if (Number.isInteger(count) && count >= 1 && count <= 12) { setQuestionCount(count); setPreview(null); } }} />
          <p className={styles.sessionFieldHint}>包含概念、简答、代码阅读及编写/修复题。代码由 AI 静态评阅，不会执行。</p>
          <Button variant="secondary" icon={BookOpen} loading={loadingPreview} disabled={status === 'loading' || (!preset && selectedIds.length === 0) || questionCount < 1} onClick={() => void showPreview()}>
            预览将发送内容
          </Button>
        </div>

        <div className={styles.sessionPreview}>
          {!preview ? (
            <div className={styles.sessionPreviewEmpty}>
              <Sparkles size={22} aria-hidden />
              <strong>确认笔记范围后再生成</strong>
              <span>生成前会列出发送给 AI 服务的笔记正文。</span>
            </div>
          ) : (
            <>
              <div className={styles.sessionPreviewHeading}>
                <div><h3>将发送以下笔记内容</h3><p>只有点击“确认并生成练习”后，内容才会发送至已配置的 AI 服务。</p></div>
                <Tag tone="accent">{preview.sources.length} 篇笔记</Tag>
              </div>
              <div className={styles.sessionSourceList}>
                {preview.sources.map((source) => (
                  <details className={styles.sessionSource} key={source.noteId} open={preview.sources.length === 1}>
                    <summary><span>{source.noteTitle}</span><small>{source.courseName} · {source.contentExcerpt.length.toLocaleString()} 字</small></summary>
                    <pre>{source.contentExcerpt}</pre>
                  </details>
                ))}
              </div>
              <Button variant="primary" icon={Check} loading={generating} disabled={status !== 'ready'} onClick={() => void generate()}>
                确认并生成练习
              </Button>
            </>
          )}
        </div>
      </div>
      {error ? <p className={styles.sessionError} role="alert">{error}</p> : null}
    </section>
  );
}

function sharedLanguage(languages: LanguageId[]): LanguageId {
  return languages.length > 0 && languages.every((language) => language === languages[0])
    ? languages[0] ?? 'text'
    : 'text';
}
