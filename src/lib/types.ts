/* =============================================================================
   码迹 · 领域数据类型
   -----------------------------------------------------------------------------
   这一份类型同时被三处使用：
     1. 渲染进程的界面与状态
     2. preload 暴露的 window.maji API 契约
     3. Electron 主进程的 SQLite 读写与 IPC 参数校验
   任何一处改字段，另外两处必须同步。
   ============================================================================= */

/** 支持语法高亮的语言（与 Shiki 的 lang id 保持一致） */
export type LanguageId =
  | 'python'
  | 'javascript'
  | 'typescript'
  | 'html'
  | 'css'
  | 'java'
  | 'c'
  | 'text';

export type CourseTrackId =
  | 'python' | 'javascript' | 'typescript' | 'html' | 'css' | 'java' | 'c' | 'text'
  | 'vue' | 'react' | 'nodejs' | 'springboot' | 'django' | 'flask' | 'algorithms' | 'database' | 'other';

export interface LanguageMeta {
  id: LanguageId;
  /** 界面上显示的名称 */
  label: string;
  /** 新建笔记/片段时的默认文件名后缀提示 */
  extension: string;
}

/** 课程配色只允许使用令牌里定义的固定色板，保证整体克制统一 */
export type CourseColorKey = 'teal' | 'blue' | 'violet' | 'amber' | 'green' | 'rose' | 'slate';

export interface Course {
  id: string;
  name: string;
  /** 一句话说明，例如“第 3 周 · 函数与模块” */
  description: string;
  /** 课程主语言，用于新建笔记时的默认值 */
  language: LanguageId;
  /** 学习方向（语言、框架或主题）；笔记语言由该方向映射为合理默认值 */
  track: CourseTrackId;
  colorKey: CourseColorKey;
  /** Lucide 图标名（见 src/lib/icons.ts 的白名单映射） */
  iconKey: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Note {
  id: string;
  courseId: string;
  title: string;
  /** TipTap 文档 JSON 序列化后的字符串 */
  contentJson: string;
  /** 从文档中抽取的纯文本，用于搜索与摘要，避免每次搜索都解析 JSON */
  contentText: string;
  /** 列表里显示的一句话摘要 */
  excerpt: string;
  language: LanguageId;
  tags: string[];
  favorite: boolean;
  /** 已归档的笔记在管理页默认折叠 */
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  /** 最近一次在编辑器中打开的时间，用于“继续学习” */
  lastOpenedAt: string | null;
}

/** 列表与卡片使用的轻量投影，不携带正文，避免列表页加载整库正文 */
export type NoteSummary = Omit<Note, 'contentJson' | 'contentText'> & {
  courseName: string;
  courseColorKey: CourseColorKey;
};

export interface NoteInput {
  courseId: string;
  title: string;
  language: LanguageId;
  tags?: string[];
  contentJson?: string;
}

export interface NotePatch {
  title?: string;
  courseId?: string;
  contentJson?: string;
  contentText?: string;
  excerpt?: string;
  language?: LanguageId;
  tags?: string[];
  favorite?: boolean;
  archived?: boolean;
  lastOpenedAt?: string | null;
}

export interface NoteListFilter {
  courseId?: string;
  tag?: string;
  favorite?: boolean;
  language?: LanguageId;
  archived?: boolean;
  search?: string;
  limit?: number;
}

export interface CodeSnippet {
  id: string;
  title: string;
  language: LanguageId;
  code: string;
  /** 这段代码在讲什么 */
  description: string;
  /** 运行结果，可为空 */
  output: string | null;
  courseId: string | null;
  noteId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CodeSnippetInput {
  title: string;
  language: LanguageId;
  code: string;
  description?: string;
  output?: string | null;
  courseId?: string | null;
  noteId?: string | null;
}

/** 复习状态：待复习 / 已排期 / 已掌握 / 已归档 */
export type ReviewState = 'due' | 'scheduled' | 'mastered' | 'archived';

export interface ReviewItem {
  id: string;
  /** 知识点标题，通常来自笔记里的一个小节 */
  title: string;
  /** 该知识点的摘要，复习页要能只看这一句就回忆起来 */
  summary: string;
  noteId: string;
  courseId: string;
  state: ReviewState;
  /** 下次复习时间（ISO），state 为 mastered 时可为空 */
  dueAt: string | null;
  lastReviewedAt: string | null;
  /** 累计复习次数，用于“再复习一次”后的提示 */
  reviewCount: number;
  /** 连续标记为掌握的次数；未掌握或稍后提醒会重置 */
  masteredStreak: number;
  /** 用户在复习时选择的掌握程度 */
  confidence: 'low' | 'medium' | 'high' | null;
  createdAt: string;
  updatedAt: string;
}

export type ReviewAction = 'review-again' | 'mastered' | 'remind-later';

export interface ReviewItemWithNote extends ReviewItem {
  noteTitle: string;
  courseName: string;
  courseColorKey: CourseColorKey;
}

/** AI 练习生成时使用的原始笔记快照；历史不依赖笔记外键存活。 */
export interface ReviewSourceSnapshot {
  noteId: string | null;
  noteTitle: string;
  courseName: string;
  contentExcerpt: string;
  reviewItemIds: string[];
}

export type ReviewDepth = 'quick' | 'standard' | 'deep';
export type ReviewQuestionType =
  | 'concept'
  | 'short-answer'
  | 'code-reading'
  | 'code-writing'
  | 'code-fix';
export type ReviewSessionStatus = 'in-progress' | 'completed';

export interface GeneratedReviewQuestion {
  type: ReviewQuestionType;
  difficulty: ExerciseDifficulty;
  title: string;
  prompt: string;
  hint: string;
  referenceAnswer: string;
  explanation: string;
  language: LanguageId;
  sourceNoteId: string | null;
}

export interface ReviewGrade {
  score: number;
  rationale: string;
  omissions: string[];
  feedback: string;
  referenceAnswer: string;
  explanation: string;
}

export interface ActiveTimeSegment {
  startedAt: string;
  endedAt: string;
}

export interface ReviewQuestion extends GeneratedReviewQuestion {
  id: string;
  sessionId: string;
  order: number;
  answer: string | null;
  grade: ReviewGrade | null;
  answeredAt: string | null;
  gradedAt: string | null;
}

export interface ReviewSession {
  id: string;
  scope: 'due' | 'course' | 'notes';
  status: ReviewSessionStatus;
  depth: ReviewDepth;
  plannedQuestionCount: number;
  sources: ReviewSourceSnapshot[];
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number;
  activeSegments: ActiveTimeSegment[];
  activeSegmentStartedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewSessionSummary extends ReviewSession {
  questionCount: number;
  averageScore: number | null;
}

export interface ReviewSessionWithQuestions extends ReviewSessionSummary {
  questions: ReviewQuestion[];
}

export interface ReviewSessionInput {
  scope: ReviewSession['scope'];
  depth: ReviewDepth;
  plannedQuestionCount: number;
  sources: ReviewSourceSnapshot[];
  questions: GeneratedReviewQuestion[];
}

export interface ReviewSessionPatch {
  status?: ReviewSessionStatus;
  activeSegments?: ActiveTimeSegment[];
  activeSegmentStartedAt?: string | null;
  endedAt?: string | null;
}

export interface ReviewSessionFilter {
  fromDate?: string;
  toDate?: string;
  status?: ReviewSessionStatus;
}

export interface ReviewQuestionAnswerInput {
  questionId: string;
  answer: string;
}

export interface ReviewQuestionGradeInput {
  questionId: string;
  grade: ReviewGrade;
}

export interface ReviewGenerationInput {
  sources: ReviewSourceSnapshot[];
  depth: ReviewDepth;
  count: number;
  language: LanguageId;
}

export interface ReviewGradingInput {
  question: GeneratedReviewQuestion;
  answer: string;
}

export type ExerciseDifficulty = 'easy' | 'medium' | 'hard';

export interface Exercise {
  id: string;
  title: string;
  /** 题目正文 */
  prompt: string;
  /** 思路提示，默认折叠 */
  hint: string | null;
  /** 参考答案，默认折叠 */
  solution: string | null;
  language: LanguageId;
  difficulty: ExerciseDifficulty;
  done: boolean;
  courseId: string | null;
  noteId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExerciseInput {
  title: string;
  prompt: string;
  language: LanguageId;
  difficulty?: ExerciseDifficulty;
  hint?: string | null;
  solution?: string | null;
  courseId?: string | null;
  noteId?: string | null;
}

export interface Tag {
  name: string;
  noteCount: number;
}

/** 搜索结果：命中片段、所属课程、更新时间、命中位置 */
export type SearchHitField = 'title' | 'body' | 'code' | 'tag';

export interface SearchResult {
  noteId: string;
  title: string;
  courseId: string;
  courseName: string;
  courseColorKey: CourseColorKey;
  language: LanguageId;
  updatedAt: string;
  favorite: boolean;
  tags: string[];
  /** 命中字段，用于结果行上显示“标题命中 / 代码命中” */
  hitField: SearchHitField;
  /** 带高亮标记的片段，<mark> 由界面渲染 */
  snippet: string;
  /** 命中的关键词个数，用于排序 */
  score: number;
}

export interface SearchQuery {
  /** 关键词，空字符串表示只做筛选 */
  text: string;
  courseId?: string;
  language?: LanguageId;
  favoriteOnly?: boolean;
  /** 是否检索代码块内容，默认 true */
  includeCode?: boolean;
  limit?: number;
}

export type ThemeMode = 'light' | 'dark';

export interface UserSettings {
  theme: ThemeMode;
  /** 编辑器正文字号 */
  editorFontSize: number;
  editorFontFamily: 'sans' | 'mono';
  /** 自动保存延迟（毫秒） */
  autoSaveDelayMs: number;
  /** 侧栏是否折叠为图标栏 */
  sidebarCollapsed: boolean;
  /** 右侧辅助栏是否收起 */
  asideCollapsed: boolean;
  /** 上次打开的笔记，用于启动后恢复现场 */
  lastOpenedNoteId: string | null;
  /** 最近打开的笔记，最多 6 条 */
  recentNoteIds: string[];
}

export const DEFAULT_SETTINGS: UserSettings = {
  theme: 'light',
  editorFontSize: 15,
  editorFontFamily: 'sans',
  autoSaveDelayMs: 700,
  sidebarCollapsed: false,
  asideCollapsed: false,
  lastOpenedNoteId: null,
  recentNoteIds: [],
};

/** 新建流程支持的四种内容 */
export type CreateKind = 'note' | 'snippet' | 'exercise' | 'course';

export interface CreateNotePayload extends NoteInput {
  kind: 'note';
}

export interface CreateSnippetPayload extends CodeSnippetInput {
  kind: 'snippet';
}

export interface CreateExercisePayload extends ExerciseInput {
  kind: 'exercise';
}

export interface CreateCoursePayload {
  kind: 'course';
  name: string;
  description: string;
  language: LanguageId;
  track: CourseTrackId;
  colorKey: CourseColorKey;
  iconKey: string;
}

export type CreatePayload =
  | CreateNotePayload
  | CreateSnippetPayload
  | CreateExercisePayload
  | CreateCoursePayload;

/* ---------------------------------------------------------------------------
   笔记大纲与统计（由 TipTap 文档派生，属于纯逻辑，可单独测试）
   --------------------------------------------------------------------------- */

export type OutlineKind = 'heading' | 'code' | 'callout' | 'output';

export interface OutlineItem {
  id: string;
  kind: OutlineKind;
  /** 标题层级；非标题节点固定为 3，用于缩进 */
  level: 1 | 2 | 3;
  text: string;
  /** ProseMirror 文档位置，用于点击跳转 */
  pos: number;
}

export interface NoteStats {
  /** 正文字符数（不含代码） */
  words: number;
  codeBlocks: number;
  minutes: number;
}

/* ---------------------------------------------------------------------------
   保存状态：编辑页顶部要能明确区分这几种状态
   --------------------------------------------------------------------------- */
export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

export interface SaveState {
  status: SaveStatus;
  /** 最近一次成功保存的时间 */
  savedAt: string | null;
  /** 保存失败时的可读原因 */
  error: string | null;
}
