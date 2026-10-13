import { createId } from './text';
export const FILE_ROLES = [
  'Controller',
  'Service',
  'Mapper',
  '实体',
  '前端',
  '配置',
  '测试',
  '其他',
] as const;
export type ExamStatus = 'unmarked' | 'wrong' | 'partial' | 'uncertain' | 'correct';
export type TrainingLevel = 'basic' | 'repair' | 'project';
export type MasteryState = '待补强' | '训练中' | '基本掌握' | '待复查';
export interface ProjectFile {
  id: string;
  path: string;
  role: string;
  language: string;
  content: string;
  includeInAI?: boolean;
}
export interface ExamReference {
  questionId: string;
  path: string;
  line: number;
  quote: string;
}
export interface ExamConcept {
  name: string;
  evidence: string;
  questionIds: string[];
}
export interface ExamAnalysis {
  summary: string;
  steps: string[];
  answer: string;
  pitfalls: string[];
  missing: string[];
  concepts: ExamConcept[];
  refs: ExamReference[];
  assessment: 'correct' | 'partial' | 'wrong' | 'unknown';
}
export interface ExamQuestion {
  id: string;
  title: string;
  type: string;
  points: number;
  prompt: string;
  promptDoc: string;
  referenceAnswer: string;
  originalAnswer: string;
  correction: string;
  status: ExamStatus;
  files: ProjectFile[];
  categories?: string[];
  analysis: ExamAnalysis | null;
  analyzedAt: string | null;
  analysisSource: string | null;
}
export interface ExamTraining {
  id: string;
  title: string;
  prompt: string;
  level: TrainingLevel;
  topic: string;
  sourceQuestionIds: string[];
  files: ProjectFile[];
  referenceAnswer: string;
  explanation: string;
  answer: string;
  feedback: ExamAnalysis | null;
  submittedAt: string | null;
  durationSeconds: number;
  createdAt: string;
}
export interface ExamRecord {
  kind?: 'programming';
  id: string;
  title: string;
  date: string;
  course: string;
  remarks: string;
  questions: ExamQuestion[];
  weaknesses: ExamAnalysis | null;
  weaknessesSource: string | null;
  trainings: ExamTraining[];
  mastery: Array<{ name: string; state: MasteryState }>;
  revision: number;
  createdAt: string;
  updatedAt: string;
}
export interface ExamAIRequest {
  operation: 'analyze' | 'weakness' | 'train' | 'grade';
  questions: ExamQuestion[];
  level: TrainingLevel;
  count: number;
  topic?: string;
}
export interface ExamApi {
  list(): Promise<ExamRecord[]>;
  save(exam: ExamRecord): Promise<ExamRecord>;
  analyze(input: ExamAIRequest): Promise<ExamAnalysis | ExamTraining[]>;
}
const blankDoc = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] });
export function newQuestion(): ExamQuestion {
  return {
    id: createId('question'),
    title: '新题目',
    type: '简答题',
    points: 0,
    prompt: '',
    promptDoc: blankDoc,
    referenceAnswer: '',
    originalAnswer: '',
    correction: '',
    status: 'unmarked',
    files: [],
    analysis: null,
    analyzedAt: null,
    analysisSource: null,
  };
}
export function newExam(title: string): ExamRecord {
  const now = new Date().toISOString();
  return {
    id: createId('exam'),
    title,
    date: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`,
    course: '',
    remarks: '',
    questions: [newQuestion()],
    weaknesses: null,
    weaknessesSource: null,
    trainings: [],
    mastery: [],
    revision: 0,
    createdAt: now,
    updatedAt: now,
  };
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('考试数据格式无效');
  return value as Record<string, unknown>;
}
function text(value: unknown, max = 100000): string {
  if (typeof value !== 'string' || value.length > max)
    throw new Error('考试文本无效或超过长度限制');
  return value;
}
function id(value: unknown): string {
  const result = text(value, 200);
  if (!/^[\w-]+$/.test(result)) throw new Error('考试 ID 无效');
  return result;
}
function integer(value: unknown, max: number): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > max)
    throw new Error('考试数值无效');
  return Number(value);
}
function list<T>(value: unknown, max: number, validate: (v: unknown) => T): T[] {
  if (!Array.isArray(value) || value.length > max) throw new Error('考试列表无效或数量超限');
  return value.map(validate);
}
function choice<T extends string>(value: unknown, options: readonly T[]): T {
  if (!options.includes(value as T)) throw new Error('考试选项无效');
  return value as T;
}
function stamp(value: unknown): string {
  const result = text(value, 40);
  if (!Number.isFinite(Date.parse(result))) throw new Error('考试时间无效');
  return result;
}
function nullable<T>(value: unknown, fn: (v: unknown) => T): T | null {
  return value === null ? null : fn(value);
}
export function categoryName(value: unknown): string {
  const name = text(value, 60).trim();
  if (!name || /[\x00-\x1f]/.test(name)) throw new Error('分类名称需填写，最多 60 字');
  return name;
}
export function validateProjectFile(value: unknown): ProjectFile {
  const f = object(value),
    path = text(f.path, 240).replace(/\\/g, '/');
  if (
    !path ||
    path.startsWith('/') ||
    /[:\x00-\x1f]/.test(path) ||
    path.split('/').some((p) => !p || p === '.' || p === '..')
  )
    throw new Error('项目文件路径无效');
  if (f.includeInAI !== undefined && typeof f.includeInAI !== 'boolean')
    throw new Error('AI 文件选择无效');
  return {
    id: id(f.id),
    path,
    role: categoryName(f.role),
    language: text(f.language, 30),
    content: text(f.content),
    ...(f.includeInAI !== undefined ? { includeInAI: f.includeInAI as boolean } : {}),
  };
}
export function validateAnalysis(value: unknown): ExamAnalysis {
  const a = object(value);
  return {
    summary: text(a.summary, 12000),
    answer: text(a.answer, 30000),
    steps: list(a.steps, 40, (v) => text(v, 4000)),
    pitfalls: list(a.pitfalls, 40, (v) => text(v, 4000)),
    missing: list(a.missing, 40, (v) => text(v, 2000)),
    concepts: list(a.concepts, 30, (v) => {
      const c = object(v);
      return {
        name: text(c.name, 120),
        evidence: text(c.evidence, 4000),
        questionIds: list(c.questionIds, 100, id),
      };
    }),
    refs: list(a.refs, 100, (v) => {
      const r = object(v);
      const line = integer(r.line, 100000);
      if (line < 1) throw new Error('引用行号无效');
      return {
        questionId: id(r.questionId),
        path: text(r.path, 240),
        line,
        quote: text(r.quote, 2000),
      };
    }),
    assessment: choice(a.assessment, ['correct', 'partial', 'wrong', 'unknown']),
  };
}
export function validateQuestion(value: unknown): ExamQuestion {
  const q = object(value),
    files = list(q.files, 40, validateProjectFile),
    doc = text(q.promptDoc, 1000000);
  let parsed;
  try {
    parsed = JSON.parse(doc);
  } catch {
    throw new Error('题干文档无效');
  }
  if (parsed?.type !== 'doc' || !Array.isArray(parsed.content)) throw new Error('题干文档无效');
  if (
    new Set(files.map((f) => f.path.toLowerCase())).size !== files.length ||
    new Set(files.map((f) => f.id)).size !== files.length
  )
    throw new Error('项目文件路径或 ID 重复');
  if (q.categories !== undefined) {
    const categories = list(q.categories, 30, categoryName);
    if (new Set(categories.map((c) => c.toLowerCase())).size !== categories.length)
      throw new Error('文件分类名称重复');
  }
  return {
    id: id(q.id),
    title: text(q.title, 200),
    type: text(q.type, 40),
    points: integer(q.points, 10000),
    prompt: text(q.prompt),
    promptDoc: doc,
    referenceAnswer: text(q.referenceAnswer),
    originalAnswer: text(q.originalAnswer),
    correction: text(q.correction),
    status: choice(q.status, ['unmarked', 'wrong', 'partial', 'uncertain', 'correct']),
    files,
    ...(q.categories !== undefined ? { categories: list(q.categories, 30, categoryName) } : {}),
    analysis: nullable(q.analysis, validateAnalysis),
    analyzedAt: nullable(q.analyzedAt, stamp),
    analysisSource: nullable(q.analysisSource, (v) => text(v, 120000)),
  };
}
export function validateTraining(value: unknown): ExamTraining {
  const t = object(value);
  return {
    id: id(t.id),
    title: text(t.title, 200),
    prompt: text(t.prompt),
    level: choice(t.level, ['basic', 'repair', 'project']),
    topic: text(t.topic, 120),
    sourceQuestionIds: list(t.sourceQuestionIds, 100, id),
    files: list(t.files, 40, validateProjectFile),
    referenceAnswer: text(t.referenceAnswer),
    explanation: text(t.explanation),
    answer: text(t.answer),
    feedback: nullable(t.feedback, validateAnalysis),
    submittedAt: nullable(t.submittedAt, stamp),
    durationSeconds: integer(t.durationSeconds, 604800),
    createdAt: stamp(t.createdAt),
  };
}
export function validateExam(value: unknown): ExamRecord {
  if (JSON.stringify(value).length > 5 * 1024 * 1024)
    throw new Error('考试资料超过 5 MiB，请拆分考试');
  const e = object(value),
    date = text(e.date, 10);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(Date.parse(date)) ||
    new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date
  )
    throw new Error('考试日期无效');
  const questions = list(e.questions, 100, validateQuestion),
    trainings = list(e.trainings, 300, validateTraining);
  if (
    new Set([...questions, ...trainings].map((q) => q.id)).size !==
    questions.length + trainings.length
  )
    throw new Error('考试题目 ID 重复');
  const title = text(e.title, 200);
  if (!title.trim()) throw new Error('请填写考试名称');
  const mastery = list(e.mastery ?? [], 30, (v) => {
    const item = object(v);
    return {
      name: text(item.name, 120),
      state: choice(item.state, ['待补强', '训练中', '基本掌握', '待复查']),
    };
  });
  if (e.kind !== undefined && e.kind !== 'programming') throw new Error('记录类型无效');
  return {
    ...(e.kind === 'programming' ? { kind: 'programming' as const } : {}),
    id: id(e.id),
    title,
    date,
    mastery,
    course: text(e.course, 200),
    remarks: text(e.remarks, 10000),
    questions,
    trainings,
    weaknesses: nullable(e.weaknesses, validateAnalysis),
    weaknessesSource: nullable(e.weaknessesSource, (v) => text(v, 120000)),
    revision: integer(e.revision, 1000000000),
    createdAt: stamp(e.createdAt),
    updatedAt: stamp(e.updatedAt),
  };
}
export function questionContext(q: ExamQuestion) {
  return {
    id: q.id,
    title: q.title,
    type: q.type,
    prompt: q.prompt,
    referenceAnswer: q.referenceAnswer,
    originalAnswer: q.originalAnswer,
    status: q.status,
    fileManifest: q.files.map((f) => ({
      path: f.path,
      role: f.role,
      provided: f.includeInAI !== false,
    })),
    files: q.files
      .filter((f) => f.includeInAI !== false)
      .map(({ path, role, language, content }) => ({ path, role, language, content })),
  };
}
export function examSource(questions: ExamQuestion[]): string {
  return JSON.stringify(questions.map(questionContext));
}
export function validateExamAIRequest(value: unknown): ExamAIRequest {
  const r = object(value),
    questions = list(r.questions, 30, validateQuestion),
    count = integer(r.count, 6);
  if (!questions.length || count < 1) throw new Error('请选择题目与训练数量');
  const operation = choice(r.operation, ['analyze', 'weakness', 'train', 'grade']);
  if (
    operation === 'weakness' &&
    questions.some((q) => !['wrong', 'partial', 'uncertain'].includes(q.status))
  )
    throw new Error('弱项分析只接受错题或尚未理解的题目');
  if (examSource(questions).length > 120000)
    throw new Error('AI 上下文超过 12 万字符，请减少题目或项目文件');
  if (['analyze', 'grade'].includes(operation) && questions.length !== 1)
    throw new Error('解题分析一次只接受一道题');
  return {
    operation,
    questions,
    level: choice(r.level, ['basic', 'repair', 'project']),
    count,
    topic: r.topic === undefined ? '' : text(r.topic, 120),
  };
}
export function validateExamAIResult(
  value: unknown,
  input: ExamAIRequest,
): ExamAnalysis | ExamTraining[] {
  const ids = new Set(input.questions.map((q) => q.id));
  if (input.operation === 'train') {
    const items = list(value, 6, validateTraining);
    if (items.length !== input.count) throw new Error('训练题数量不一致，请重试');
    for (const item of items) {
      if (
        item.level !== input.level ||
        !item.sourceQuestionIds.length ||
        item.sourceQuestionIds.some((q) => !ids.has(q))
      )
        throw new Error('训练题来源无效');
      if (item.answer || item.feedback || item.submittedAt || item.durationSeconds)
        throw new Error('生成训练题不能预填作答记录');
      if (!item.prompt.trim() || !item.referenceAnswer.trim())
        throw new Error('训练题缺少题干或答案');
      if (input.level !== 'basic' && !item.files.length)
        throw new Error('代码训练题需包含项目文件');
      if (
        input.level === 'project' &&
        (item.files.length < 2 || new Set(item.files.map((f) => f.role)).size < 2)
      )
        throw new Error('综合训练需包含至少两个层级的项目文件');
    }
    if (new Set(items.map((t) => t.id)).size !== items.length) throw new Error('训练题 ID 重复');
    return items;
  }
  const result = validateAnalysis(value);
  for (const concept of result.concepts)
    if (!concept.questionIds.length || concept.questionIds.some((q) => !ids.has(q)))
      throw new Error('弱项证据来源无效');
  for (const ref of result.refs) {
    const file = input.questions
      .find((q) => q.id === ref.questionId)
      ?.files.find((f) => f.path === ref.path && f.includeInAI !== false);
    if (
      !file ||
      !ref.quote.trim() ||
      !file.content
        .split('\n')
        .slice(ref.line - 1, ref.line - 1 + ref.quote.split('\n').length)
        .join('\n')
        .includes(ref.quote)
    )
      throw new Error('AI 文件引用与原文不一致，请重试');
  }
  return result;
}
