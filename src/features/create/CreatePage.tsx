import {
  BookPlus,
  CircleAlert,
  CircleCheck,
  Code,
  FilePlus2,
  FileText,
  ListChecks,
  Plus,
  Sparkles,
} from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLibrary } from '../../app/LibraryProvider';
import { ROUTES } from '../../app/routes';
import { useToast } from '../../app/ToastProvider';
import { Button } from '../../components/ui/Button';
import { SelectField, TextareaField, TextField } from '../../components/ui/Fields';
import page from '../../components/layout/page.module.css';
import { LANGUAGE_OPTIONS, languageMeta, languageName } from '../../lib/languages';
import { COURSE_TRACKS, defaultLanguageForTrack, trackFromLanguage } from '../../lib/courseTracks';
import { doc, heading, paragraph } from '../../lib/noteDoc';
import type { CourseTrackId, CreateKind, ExerciseDifficulty, LanguageId } from '../../lib/types';
import styles from './create.module.css';

const KIND_META: Array<{
  kind: CreateKind;
  icon: typeof FileText;
  label: string;
  hint: string;
}> = [
  { kind: 'note', icon: FileText, label: '普通笔记', hint: '记录一节课的知识点，支持代码块与提示块' },
  { kind: 'snippet', icon: Code, label: '代码片段', hint: '保存可复用的代码、说明和运行结果' },
  { kind: 'exercise', icon: ListChecks, label: '练习题', hint: '挂到课程或笔记上，方便回头练' },
  { kind: 'course', icon: BookPlus, label: '课程', hint: '新建一门课程，作为笔记的第一层分类' },
];

interface SuccessInfo {
  kind: CreateKind;
  title: string;
  meta: string;
  /** 创建成功后可以直达的目标 */
  openTo?: string;
}

/** 新建内容流程：选择类型 → 填写表单 → 展示创建成功状态 */
export function CreatePage(): ReactElement {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { courses, notes, createNote, createSnippet, createExercise, createCourse } = useLibrary();

  const kindParam = params.get('type');
  const kind: CreateKind = (KIND_META.find((item) => item.kind === kindParam)?.kind ?? 'note') as CreateKind;
  const presetCourse = params.get('course') ?? courses[0]?.id ?? '';
  const presetNote = params.get('note') ?? '';

  const [courseId, setCourseId] = useState(presetCourse);
  const [noteId, setNoteId] = useState(presetNote);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [language, setLanguage] = useState<LanguageId>(courses[0]?.language ?? 'python');
  const [tags, setTags] = useState('');
  const [code, setCode] = useState('');
  const [output, setOutput] = useState('');
  const [prompt, setPrompt] = useState('');
  const [hint, setHint] = useState('');
  const [solution, setSolution] = useState('');
  const [difficulty, setDifficulty] = useState<ExerciseDifficulty>('easy');
  const [courseName, setCourseName] = useState('');
  const [courseDescription, setCourseDescription] = useState('');
  const [courseTrack, setCourseTrack] = useState<CourseTrackId>(trackFromLanguage(courses[0]?.language ?? 'python'));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState<SuccessInfo | null>(null);

  const switchKind = (next: CreateKind): void => {
    setParams({ type: next });
    setErrors({});
    setSuccess(null);
  };

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (kind === 'course') {
      if (!courseName.trim()) next['courseName'] = '请填写课程名称';
    } else if (kind === 'snippet') {
      if (!title.trim()) next['title'] = '请给这段代码起一个名字';
      if (!code.trim()) next['code'] = '请粘贴代码内容';
    } else if (kind === 'exercise') {
      if (!title.trim()) next['title'] = '请填写练习标题';
      if (!prompt.trim()) next['prompt'] = '请写清楚题目要求';
    } else {
      if (!title.trim()) next['title'] = '请填写笔记标题';
      if (!courseId) next['courseId'] = '请选择所属课程';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (): Promise<void> => {
    if (!validate()) return;
    setBusy(true);
    try {
      if (kind === 'course') {
        const created = await createCourse({
          name: courseName.trim(),
          description: courseDescription.trim(),
          track: courseTrack,
          language: defaultLanguageForTrack(courseTrack),
          colorKey: 'teal',
          iconKey: 'book',
        });
        setSuccess({
          kind,
          title: created.name,
          meta: `主语言 ${languageName(created.language)} · 还没有笔记`,
          openTo: ROUTES.coursesWith({ courseId: created.id }),
        });
      } else if (kind === 'snippet') {
        const created = await createSnippet({
          title: title.trim(),
          language,
          code,
          description: body.trim(),
          output: output.trim() || null,
          courseId: courseId || null,
          noteId: noteId || null,
        });
        setSuccess({
          kind,
          title: created.title,
          meta: `${languageName(created.language)} · ${code.split('\n').length} 行代码`,
          openTo: created.noteId ? ROUTES.note(created.noteId) : ROUTES.coursesWith({ courseId }),
        });
      } else if (kind === 'exercise') {
        const created = await createExercise({
          title: title.trim(),
          prompt: prompt.trim(),
          hint: hint.trim() || null,
          solution: solution.trim() || null,
          language,
          difficulty,
          courseId: courseId || null,
          noteId: noteId || null,
        });
        setSuccess({
          kind,
          title: created.title,
          meta: `${{ easy: '简单', medium: '中等', hard: '困难' }[created.difficulty]} · ${
            created.noteId ? '已挂到笔记上' : '尚未关联笔记'
          }`,
          openTo: created.noteId ? ROUTES.note(created.noteId) : ROUTES.coursesWith({ courseId }),
        });
      } else {
        const created = await createNote({
          courseId,
          title: title.trim(),
          language,
          tags: tags
            .split(/[,，\s]+/)
            .map((tag) => tag.trim())
            .filter(Boolean)
            .slice(0, 20),
          // 摘要不为空时，直接作为正文的第一段，避免新笔记完全空白
          contentJson: body.trim()
            ? JSON.stringify(doc(heading(2, '要点'), paragraph(body.trim())))
            : undefined,
        });
        setSuccess({
          kind,
          title: created.title,
          meta: `${courses.find((course) => course.id === courseId)?.name ?? '未分类'} · 刚刚创建`,
          openTo: ROUTES.note(created.id),
        });
        toast.show({ message: '笔记已创建，可以开始记录了', tone: 'success' });
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '创建失败，请重试';
      setErrors({ form: message });
      toast.show({ message, tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  if (success) {
    return (
      <div className={page.page} data-scroll-container>
        <div className={page.inner}>
          <div className={styles.success}>
            <span className={styles.successIcon}>
              <CircleCheck size={22} aria-hidden />
            </span>
            <h1 className={styles.successTitle}>创建成功</h1>
            <p className={styles.successText}>
              {success.kind === 'course'
                ? '课程已建好，接下来可以在里面写第一篇笔记。'
                : success.kind === 'snippet'
                  ? '代码片段已保存，随时可以在搜索里找到它。'
                  : success.kind === 'exercise'
                    ? '练习题已保存，会出现在关联笔记的右侧栏里。'
                    : '笔记已保存到本机，可以开始记录了。'}
            </p>

            <div className={styles.successCard}>
              <div className={styles.successCardTitle}>{success.title}</div>
              <div className={styles.successCardMeta}>{success.meta}</div>
            </div>

            <div className={styles.successActions}>
              {success.openTo ? (
                <Button
                  variant="primary"
                  icon={Sparkles}
                  onClick={() => navigate(success.openTo as string)}
                >
                  {success.kind === 'note' ? '打开并开始记录' : '查看创建的内容'}
                </Button>
              ) : null}
              <Button
                variant="secondary"
                icon={FilePlus2}
                onClick={() => {
                  setSuccess(null);
                  setTitle('');
                  setBody('');
                  setCode('');
                  setOutput('');
                  setPrompt('');
                  setHint('');
                  setSolution('');
                  setCourseName('');
                  setCourseDescription('');
                  setErrors({});
                }}
              >
                再创建一个
              </Button>
              <Button variant="ghost" onClick={() => navigate(ROUTES.home)}>
                返回学习首页
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={page.page} data-scroll-container>
      <div className={page.inner}>
        <header className={page.pageHeader}>
          <div className={page.pageHeading}>
            <h1 className={page.pageTitle}>新建内容</h1>
            <p className={page.pageSubtitle}>
              先选择要创建的类型，再填写必要信息。带 * 的字段需要填写，其余可以之后再补。
            </p>
          </div>
        </header>

        <div className={styles.typeGrid} role="group" aria-label="选择内容类型">
          {KIND_META.map((item) => (
            <button
              key={item.kind}
              type="button"
              className={styles.typeCard}
              aria-pressed={kind === item.kind}
              onClick={() => switchKind(item.kind)}
            >
              <span className={styles.typeIcon}>
                <item.icon size={16} aria-hidden />
              </span>
              <span className={styles.typeLabel}>{item.label}</span>
              <span className={styles.typeHint}>{item.hint}</span>
            </button>
          ))}
        </div>

        <form
          className={styles.form}
          /* 关掉浏览器自带的校验气泡，统一使用界面里的中文错误提示 */
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          {kind === 'course' ? (
            <>
              <TextField
                label="课程名称"
                required
                example="Vue 入门"
                hint="建议用「技术方向 + 阶段」命名"
                value={courseName}
                error={errors['courseName'] ?? null}
                onChange={(event) => setCourseName(event.target.value)}
              />
              <TextField
                label="一句话说明"
                example="第 3 周 · 函数与模块"
                value={courseDescription}
                onChange={(event) => setCourseDescription(event.target.value)}
              />
              <SelectField
                label="课程技术方向"
                hint="新建笔记时会自动选择对应的默认代码语言"
                value={courseTrack}
                options={COURSE_TRACKS}
                onChange={(event) => setCourseTrack(event.target.value as CourseTrackId)}
              />
            </>
          ) : null}

          {kind === 'note' ? (
            <>
              <TextField
                label="笔记标题"
                required
                example="函数与参数"
                hint="写清楚这节讲什么，之后搜索才容易找到"
                value={title}
                error={errors['title'] ?? null}
                onChange={(event) => setTitle(event.target.value)}
              />
              <div className={styles.formRow}>
                <SelectField
                  label="所属课程"
                  required
                  value={courseId}
                  error={errors['courseId'] ?? null}
                  options={courses.map((course) => ({ value: course.id, label: course.name }))}
                  onChange={(event) => setCourseId(event.target.value)}
                />
                <SelectField
                  label="主要语言"
                  value={language}
                  options={LANGUAGE_OPTIONS}
                  onChange={(event) => setLanguage(event.target.value as LanguageId)}
                />
              </div>
              <TextField
                label="标签"
                hint="用逗号分隔，最多 20 个"
                example="Python, 函数, 基础语法"
                value={tags}
                onChange={(event) => setTags(event.target.value)}
              />
              <TextareaField
                label="一句话摘要"
                hint="选填。会显示在列表和搜索结果里"
                example="函数可以把一段可重复使用的逻辑组织起来，并通过参数接收外部数据。"
                value={body}
                onChange={(event) => setBody(event.target.value)}
              />
            </>
          ) : null}

          {kind === 'snippet' ? (
            <>
              <TextField
                label="片段名称"
                required
                example="用 f-string 拼接字符串"
                value={title}
                error={errors['title'] ?? null}
                onChange={(event) => setTitle(event.target.value)}
              />
              <div className={styles.formRow}>
                <SelectField
                  label="编程语言"
                  value={language}
                  options={LANGUAGE_OPTIONS}
                  onChange={(event) => setLanguage(event.target.value as LanguageId)}
                />
                <SelectField
                  label="关联课程"
                  value={courseId}
                  options={[{ value: '', label: '不关联课程' }, ...courses.map((course) => ({ value: course.id, label: course.name }))]}
                  onChange={(event) => setCourseId(event.target.value)}
                />
              </div>
              <TextareaField
                label="代码内容"
                required
                hint="保持原始缩进，粘贴即可"
                example={'def greet(name):\n    return f"你好，{name}！"'}
                value={code}
                error={errors['code'] ?? null}
                className={styles.codePreview}
                rows={6}
                onChange={(event) => setCode(event.target.value)}
              />
              <TextField
                label="运行结果"
                hint="选填。有输出时填在这里，方便以后对照"
                example="你好，小林！"
                value={output}
                onChange={(event) => setOutput(event.target.value)}
              />
              <TextareaField
                label="这段代码在做什么"
                example="在字符串前面加 f，花括号里可以直接写变量或表达式。"
                value={body}
                onChange={(event) => setBody(event.target.value)}
              />
            </>
          ) : null}

          {kind === 'exercise' ? (
            <>
              <TextField
                label="练习标题"
                required
                example="编写一个函数，接收两个数字并返回它们的和"
                value={title}
                error={errors['title'] ?? null}
                onChange={(event) => setTitle(event.target.value)}
              />
              <div className={styles.formRow}>
                <SelectField
                  label="语言"
                  value={language}
                  options={LANGUAGE_OPTIONS}
                  onChange={(event) => setLanguage(event.target.value as LanguageId)}
                />
                <SelectField
                  label="难度"
                  value={difficulty}
                  options={[
                    { value: 'easy', label: '简单 · 课后直接能做' },
                    { value: 'medium', label: '中等 · 需要查资料' },
                    { value: 'hard', label: '困难 · 综合练习' },
                  ]}
                  onChange={(event) => setDifficulty(event.target.value as ExerciseDifficulty)}
                />
              </div>
              <TextareaField
                label="题目要求"
                required
                example="编写一个函数，接收两个数字并返回它们的和。"
                value={prompt}
                error={errors['prompt'] ?? null}
                onChange={(event) => setPrompt(event.target.value)}
              />
              <TextareaField
                label="思路提示"
                hint="选填。复习时先看提示，再看答案"
                example="函数名可以叫 add，两个参数用逗号分隔，最后用 return 把结果交出去。"
                value={hint}
                onChange={(event) => setHint(event.target.value)}
              />
              <TextareaField
                label="参考答案"
                example={'def add(a, b):\n    return a + b'}
                value={solution}
                className={styles.codePreview}
                rows={4}
                onChange={(event) => setSolution(event.target.value)}
              />
              <div className={styles.formRow}>
                <SelectField
                  label="关联课程"
                  value={courseId}
                  options={[{ value: '', label: '不关联课程' }, ...courses.map((course) => ({ value: course.id, label: course.name }))]}
                  onChange={(event) => setCourseId(event.target.value)}
                />
                <SelectField
                  label="关联笔记"
                  hint="关联后会出现在笔记右侧栏"
                  value={noteId}
                  options={[
                    { value: '', label: '不关联笔记' },
                    ...notes
                      .filter((note) => !courseId || note.courseId === courseId)
                      .map((note) => ({ value: note.id, label: note.title })),
                  ]}
                  onChange={(event) => setNoteId(event.target.value)}
                />
              </div>
            </>
          ) : null}

          {errors['form'] ? (
            <span className={styles.formError} role="alert">
              <CircleAlert size={13} aria-hidden />
              {errors['form']}
            </span>
          ) : null}

          <div className={styles.formActions}>
            <Button type="submit" variant="primary" icon={Plus} loading={busy}>
              {kind === 'course'
                ? '创建课程'
                : kind === 'snippet'
                  ? '保存代码片段'
                  : kind === 'exercise'
                    ? '保存练习题'
                    : '创建笔记'}
            </Button>
            <Button variant="secondary" onClick={() => navigate(-1)}>
              取消
            </Button>
            <span className={styles.formActionsSpacer} />
            <span className={styles.successCardMeta}>
              当前类型：{KIND_META.find((item) => item.kind === kind)?.label}
            </span>
          </div>

          <ul className={styles.hintList}>
            {kind === 'note' ? (
              <>
                <li>创建后会在编辑器中打开，正文支持 Markdown 快捷输入（# 标题、``` 代码块）。</li>
                <li>默认放在「{courses.find((course) => course.id === courseId)?.name ?? '未选择课程'}」下。</li>
              </>
            ) : null}
            {kind === 'snippet' ? (
              <>
                <li>片段会参与搜索，输入代码里的关键词就能找到它。</li>
                <li>语言用于语法高亮，支持 {LANGUAGE_OPTIONS.slice(0, 7).map((item) => item.label).join('、')}。</li>
              </>
            ) : null}
            {kind === 'exercise' ? (
              <>
                <li>练习题会显示在关联笔记的右侧栏，完成后可以勾选。</li>
                <li>参考答案默认折叠，复习时先自己想一遍。</li>
              </>
            ) : null}
            {kind === 'course' ? (
              <>
                <li>课程下还有笔记时不允许删除，避免误删内容。</li>
                <li>课程颜色只用于区分，不影响笔记内容。</li>
              </>
            ) : null}
            <li>语言默认：{languageName(language)}（文件后缀 {languageMeta(language).extension}）</li>
          </ul>
        </form>
      </div>
    </div>
  );
}
