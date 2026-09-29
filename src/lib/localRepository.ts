/* =============================================================================
   码迹 · 浏览器示例数据仓库
   -----------------------------------------------------------------------------
   什么时候用：
     · npm run dev 在浏览器里看界面（没有 Electron 主进程）
     · Playwright 端到端测试
     · Vitest 里验证数据操作行为
   数据存在 localStorage，刷新后保留；清空 localStorage 会重新播种示例数据。
   接口与 SQLite 实现完全一致，界面代码不需要区分两种数据源。
   ============================================================================= */

import type {
  CodeSnippet,
  CodeSnippetInput,
  Course,
  Exercise,
  ExerciseInput,
  Note,
  NoteInput,
  NoteListFilter,
  NotePatch,
  NoteSummary,
  ReviewAction,
  ReviewItem,
  ReviewItemWithNote,
  ActiveTimeSegment,
  ReviewQuestion,
  ReviewQuestionAnswerInput,
  ReviewQuestionGradeInput,
  ReviewSessionFilter,
  ReviewSessionInput,
  ReviewSessionPatch,
  ReviewSessionSummary,
  ReviewSessionWithQuestions,
  SearchQuery,
  SearchResult,
  Tag,
  UserSettings,
} from './types';
import { DEFAULT_SETTINGS } from './types';
import type { MajiRepository } from './repository';
import { createSeedData, type SeedData } from './demoData';
import { createId } from './text';
import { applyReviewAction } from './review';
import { searchDocuments, type SearchDocument } from './search';
import { docToPlainText, extractCodeText, noteExcerpt, starterDoc, type Doc } from './noteDoc';
import { defaultLanguageForTrack, trackFromLanguage } from './courseTracks';

const STORAGE_KEY = 'maji.local.v1';

interface LocalState extends SeedData {
  /** 数据结构版本，升级时自动重新播种 */
  version: number;
}

const STATE_VERSION = 1;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function loadState(): LocalState {
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as LocalState;
        if (parsed.version === STATE_VERSION) {
          parsed.reviewSessions ??= [];
          parsed.settings = { ...DEFAULT_SETTINGS, ...parsed.settings };
          parsed.courses = parsed.courses.map((course) => ({
            ...course,
            track: course.track ?? trackFromLanguage(course.language),
          }));
          return parsed;
        }
      }
    } catch {
      // 存储损坏时直接重新播种，不让用户卡在坏状态里
    }
  }
  return { ...createSeedData(), version: STATE_VERSION };
}

function sessionSummary(session: ReviewSessionWithQuestions): ReviewSessionSummary {
  const scores = session.questions.flatMap((question) => question.grade ? [question.grade.score] : []);
  return {
    ...session,
    questionCount: session.questions.length,
    averageScore: scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null,
  };
}

function activeDurationSeconds(
  segments: ActiveTimeSegment[],
  activeSegmentStartedAt: string | null,
  now = new Date(),
): number {
  const milliseconds = segments.reduce((sum, segment) => {
    const start = Date.parse(segment.startedAt);
    const end = Date.parse(segment.endedAt);
    return Number.isFinite(start) && Number.isFinite(end) && end > start ? sum + end - start : sum;
  }, 0);
  const openStart = activeSegmentStartedAt ? Date.parse(activeSegmentStartedAt) : NaN;
  return Math.max(0, Math.floor((milliseconds + (Number.isFinite(openStart) ? Math.max(0, now.getTime() - openStart) : 0)) / 1000));
}

function localDay(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function findQuestion(sessions: ReviewSessionWithQuestions[], sessionId: string, questionId: string): ReviewQuestion {
  const question = sessions.find((item) => item.id === sessionId)?.questions.find((item) => item.id === questionId);
  if (!question) throw new Error(`练习题不存在：${questionId}`);
  return question;
}

export class LocalRepository implements MajiRepository {
  readonly source = 'local' as const;
  private state: LocalState;

  readonly reviewSessions = {
    list: async (filter: ReviewSessionFilter = {}): Promise<ReviewSessionSummary[]> => {
      const matches = this.state.reviewSessions
        .filter((session) => !filter.status || session.status === filter.status)
        .filter((session) => {
          const localDate = localDay(session.startedAt);
          return (!filter.fromDate || localDate >= filter.fromDate) && (!filter.toDate || localDate <= filter.toDate);
        })
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
      return clone(matches.map(sessionSummary));
    },
    get: async (id: string): Promise<ReviewSessionWithQuestions | null> => {
      const session = this.state.reviewSessions.find((item) => item.id === id);
      return session ? clone(sessionSummary(session) as ReviewSessionWithQuestions) : null;
    },
    create: async (input: ReviewSessionInput): Promise<ReviewSessionWithQuestions> => {
      const now = new Date().toISOString();
      const id = createId('review_session');
      const session: ReviewSessionWithQuestions = {
        id,
        scope: input.scope,
        status: 'in-progress',
        depth: input.depth,
        plannedQuestionCount: input.plannedQuestionCount,
        sources: clone(input.sources),
        startedAt: now,
        endedAt: null,
        durationSeconds: 0,
        activeSegments: [],
        activeSegmentStartedAt: now,
        createdAt: now,
        updatedAt: now,
        questionCount: input.questions.length,
        averageScore: null,
        questions: input.questions.map((question, index) => ({
          ...clone(question),
          id: createId('review_question'),
          sessionId: id,
          order: index + 1,
          answer: null,
          grade: null,
          answeredAt: null,
          gradedAt: null,
        })),
      };
      this.state.reviewSessions.push(session);
      this.persist();
      return clone(session);
    },
    update: async (id: string, patch: ReviewSessionPatch): Promise<ReviewSessionWithQuestions> => {
      const session = this.state.reviewSessions.find((item) => item.id === id);
      if (!session) throw new Error(`复习会话不存在：${id}`);
      Object.assign(session, clone(patch), { updatedAt: new Date().toISOString() });
      if (patch.status === 'completed') session.endedAt ??= patch.endedAt ?? new Date().toISOString();
      if (patch.status === 'in-progress') session.endedAt = null;
      session.durationSeconds = activeDurationSeconds(session.activeSegments, session.activeSegmentStartedAt);
      this.persist();
      return clone(sessionSummary(session) as ReviewSessionWithQuestions);
    },
    saveAnswer: async (sessionId: string, input: ReviewQuestionAnswerInput): Promise<ReviewQuestion> => {
      const question = findQuestion(this.state.reviewSessions, sessionId, input.questionId);
      question.answer = input.answer;
      question.answeredAt = new Date().toISOString();
      question.grade = null;
      question.gradedAt = null;
      const session = this.state.reviewSessions.find((item) => item.id === sessionId)!;
      session.updatedAt = question.answeredAt;
      this.persist();
      return clone(question);
    },
    saveGrade: async (sessionId: string, input: ReviewQuestionGradeInput): Promise<ReviewQuestion> => {
      const question = findQuestion(this.state.reviewSessions, sessionId, input.questionId);
      if (question.answer === null) throw new Error('请先保存答案再提交评阅');
      question.grade = clone(input.grade);
      question.gradedAt = new Date().toISOString();
      const session = this.state.reviewSessions.find((item) => item.id === sessionId)!;
      session.updatedAt = question.gradedAt;
      this.persist();
      return clone(question);
    },
  };

  constructor(state?: LocalState) {
    this.state = state ?? loadState();
    this.persist();
  }

  private persist(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      // 隐私模式下 localStorage 可能不可写，界面仍可正常使用
    }
  }

  /** 仅供测试与“重置示例数据”功能使用 */
  reset(now: Date = new Date()): void {
    this.state = { ...createSeedData(now), version: STATE_VERSION };
    this.persist();
  }

  /* ------------------------------------------------------------- 课程 */

  async listCourses(): Promise<Course[]> {
    return clone([...this.state.courses].sort((a, b) => a.sortOrder - b.sortOrder));
  }

  async createCourse(input: Partial<Course> & { name: string }): Promise<Course> {
    const now = new Date().toISOString();
    const track = input.track ?? trackFromLanguage(input.language ?? 'python');
    const course: Course = {
      id: input.id ?? createId('course'),
      name: input.name.trim(),
      description: input.description?.trim() ?? '',
      language: input.language ?? defaultLanguageForTrack(track),
      track,
      colorKey: input.colorKey ?? 'teal',
      iconKey: input.iconKey ?? 'book',
      sortOrder: this.state.courses.length,
      createdAt: now,
      updatedAt: now,
    };
    this.state.courses.push(course);
    this.persist();
    return clone(course);
  }

  async updateCourse(id: string, patch: Partial<Course>): Promise<Course> {
    const course = this.state.courses.find((item) => item.id === id);
    if (!course) throw new Error(`课程不存在：${id}`);
    Object.assign(course, patch, { id: course.id, updatedAt: new Date().toISOString() });
    this.persist();
    return clone(course);
  }

  async deleteCourse(id: string): Promise<void> {
    const noteCount = this.state.notes.filter((note) => note.courseId === id).length;
    if (noteCount > 0) throw new Error(`该课程下还有 ${noteCount} 篇笔记，请先移动或删除笔记`);
    this.state.courses = this.state.courses.filter((course) => course.id !== id);
    this.persist();
  }

  async reorderCourses(orderedIds: string[]): Promise<void> {
    orderedIds.forEach((id, index) => {
      const course = this.state.courses.find((item) => item.id === id);
      if (course) course.sortOrder = index;
    });
    this.persist();
  }

  /* ------------------------------------------------------------- 笔记 */

  private toSummary(note: Note): NoteSummary {
    const { contentJson: _contentJson, contentText: _contentText, ...rest } = note;
    const course = this.state.courses.find((item) => item.id === note.courseId);
    return {
      ...rest,
      courseName: course?.name ?? '未分类',
      courseColorKey: course?.colorKey ?? 'slate',
    };
  }

  async listNotes(filter: NoteListFilter = {}): Promise<NoteSummary[]> {
    let notes = [...this.state.notes];
    if (filter.courseId) notes = notes.filter((note) => note.courseId === filter.courseId);
    if (filter.tag) notes = notes.filter((note) => note.tags.includes(filter.tag as string));
    if (filter.favorite) notes = notes.filter((note) => note.favorite);
    if (filter.language) notes = notes.filter((note) => note.language === filter.language);
    if (filter.archived === undefined) notes = notes.filter((note) => !note.archived);
    else notes = notes.filter((note) => note.archived === filter.archived);
    if (filter.search) {
      const keyword = filter.search.toLowerCase();
      notes = notes.filter(
        (note) =>
          note.title.toLowerCase().includes(keyword) ||
          note.contentText.toLowerCase().includes(keyword),
      );
    }
    notes.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    if (filter.limit) notes = notes.slice(0, filter.limit);
    return notes.map((note) => this.toSummary(note));
  }

  async getNote(id: string): Promise<Note | null> {
    const note = this.state.notes.find((item) => item.id === id);
    return note ? clone(note) : null;
  }

  async createNote(input: NoteInput): Promise<Note> {
    const now = new Date().toISOString();
    const content = input.contentJson ? (JSON.parse(input.contentJson) as Doc) : starterDoc(input.title);
    const plain = docToPlainText(content);
    const note: Note = {
      id: createId('note'),
      courseId: input.courseId,
      title: input.title.trim() || '未命名笔记',
      contentJson: JSON.stringify(content),
      contentText: plain,
      excerpt: noteExcerpt(content, plain),
      language: input.language,
      tags: input.tags ?? [],
      favorite: false,
      archived: false,
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now,
    };
    this.state.notes.push(note);
    this.persist();
    return clone(note);
  }

  async updateNote(id: string, patch: NotePatch): Promise<Note> {
    const note = this.state.notes.find((item) => item.id === id);
    if (!note) throw new Error(`笔记不存在：${id}`);

    Object.assign(note, patch);
    if (patch.contentJson) {
      const content = JSON.parse(patch.contentJson) as Doc;
      const plain = docToPlainText(content);
      note.contentText = plain;
      note.excerpt = noteExcerpt(content, plain);
    }
    note.updatedAt = patch.lastOpenedAt ?? new Date().toISOString();
    this.persist();
    return clone(note);
  }

  async deleteNote(id: string): Promise<void> {
    this.state.notes = this.state.notes.filter((note) => note.id !== id);
    this.state.reviewItems = this.state.reviewItems.filter((item) => item.noteId !== id);
    this.state.exercises = this.state.exercises.map((exercise) =>
      exercise.noteId === id ? { ...exercise, noteId: null } : exercise,
    );
    this.state.snippets = this.state.snippets.map((snippet) =>
      snippet.noteId === id ? { ...snippet, noteId: null } : snippet,
    );
    this.state.settings.recentNoteIds = this.state.settings.recentNoteIds.filter(
      (noteId) => noteId !== id,
    );
    if (this.state.settings.lastOpenedNoteId === id) {
      this.state.settings.lastOpenedNoteId = this.state.settings.recentNoteIds[0] ?? null;
    }
    this.persist();
  }

  async touchNote(id: string): Promise<void> {
    const note = this.state.notes.find((item) => item.id === id);
    if (!note) return;
    note.lastOpenedAt = new Date().toISOString();
    const recents = [id, ...this.state.settings.recentNoteIds.filter((noteId) => noteId !== id)];
    this.state.settings.recentNoteIds = recents.slice(0, 6);
    this.state.settings.lastOpenedNoteId = id;
    this.persist();
  }

  async searchNotes(query: SearchQuery): Promise<SearchResult[]> {
    const documents: SearchDocument[] = this.state.notes.map((note) => {
      const course = this.state.courses.find((item) => item.id === note.courseId);
      let codeText = '';
      try {
        codeText = extractCodeText(JSON.parse(note.contentJson) as Doc);
      } catch {
        codeText = '';
      }
      return {
        id: note.id,
        title: note.title,
        courseId: note.courseId,
        courseName: course?.name ?? '未分类',
        courseColorKey: course?.colorKey ?? 'slate',
        language: note.language,
        updatedAt: note.updatedAt,
        favorite: note.favorite,
        tags: note.tags,
        contentText: note.contentText,
        codeText,
      };
    });

    const results = searchDocuments(documents, query);
    const snippetResults = this.searchSnippets(query);
    const merged = [...results];
    for (const snippetResult of snippetResults) {
      if (!merged.some((item) => item.noteId === snippetResult.noteId)) merged.push(snippetResult);
    }
    return typeof query.limit === 'number' ? merged.slice(0, query.limit) : merged;
  }

  /** 代码片段也参与搜索：命中后指向它关联的笔记 */
  private searchSnippets(query: SearchQuery): SearchResult[] {
    const keyword = query.text.trim().toLowerCase();
    if (!keyword) return [];
    const results: SearchResult[] = [];
    for (const snippet of this.state.snippets) {
      if (!snippet.noteId) continue;
      const note = this.state.notes.find((candidate) => candidate.id === snippet.noteId);
      const courseId = snippet.courseId ?? note?.courseId ?? '';
      if (query.courseId && courseId !== query.courseId) continue;
      if (query.language && snippet.language !== query.language) continue;
      if (query.favoriteOnly && !note?.favorite) continue;
      const haystack = `${snippet.title} ${snippet.description}${query.includeCode === false ? '' : ` ${snippet.code}`}`.toLowerCase();
      if (!haystack.includes(keyword)) continue;
      results.push({
        noteId: snippet.noteId,
        title: snippet.title,
        courseId,
        courseName: this.state.courses.find((course) => course.id === courseId)?.name ?? '',
        courseColorKey: 'teal',
        language: snippet.language,
        updatedAt: snippet.updatedAt,
        favorite: note?.favorite ?? false,
        tags: [],
        hitField: 'code',
        snippet: `${snippet.title} · ${snippet.description}`,
        score: 2,
      });
    }
    return results;
  }

  async listTags(): Promise<Tag[]> {
    const counter = new Map<string, number>();
    for (const note of this.state.notes) {
      for (const tag of note.tags) counter.set(tag, (counter.get(tag) ?? 0) + 1);
    }
    return Array.from(counter.entries())
      .map(([name, noteCount]) => ({ name, noteCount }))
      .sort((a, b) => b.noteCount - a.noteCount || a.name.localeCompare(b.name, 'zh-Hans-CN'));
  }

  /* --------------------------------------------------------- 代码片段 */

  async listSnippets(limit?: number): Promise<CodeSnippet[]> {
    const snippets = [...this.state.snippets].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
    return clone(typeof limit === 'number' ? snippets.slice(0, limit) : snippets);
  }

  async createSnippet(input: CodeSnippetInput): Promise<CodeSnippet> {
    const now = new Date().toISOString();
    const snippet: CodeSnippet = {
      id: createId('snippet'),
      title: input.title.trim() || '未命名代码片段',
      language: input.language,
      code: input.code,
      description: input.description?.trim() ?? '',
      output: input.output ?? null,
      courseId: input.courseId ?? null,
      noteId: input.noteId ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.state.snippets.push(snippet);
    this.persist();
    return clone(snippet);
  }

  /* ----------------------------------------------------------- 练习题 */

  async listExercises(
    filter: { courseId?: string; noteId?: string; limit?: number } = {},
  ): Promise<Exercise[]> {
    let exercises = [...this.state.exercises];
    if (filter.courseId) exercises = exercises.filter((item) => item.courseId === filter.courseId);
    if (filter.noteId) exercises = exercises.filter((item) => item.noteId === filter.noteId);
    exercises.sort((a, b) => Number(a.done) - Number(b.done));
    if (filter.limit) exercises = exercises.slice(0, filter.limit);
    return clone(exercises);
  }

  async createExercise(input: ExerciseInput): Promise<Exercise> {
    const now = new Date().toISOString();
    const exercise: Exercise = {
      id: createId('exercise'),
      title: input.title.trim() || '未命名练习',
      prompt: input.prompt.trim(),
      hint: input.hint?.trim() ?? null,
      solution: input.solution?.trim() ?? null,
      language: input.language,
      difficulty: input.difficulty ?? 'easy',
      done: false,
      courseId: input.courseId ?? null,
      noteId: input.noteId ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.state.exercises.push(exercise);
    this.persist();
    return clone(exercise);
  }

  async toggleExercise(id: string, done: boolean): Promise<Exercise> {
    const exercise = this.state.exercises.find((item) => item.id === id);
    if (!exercise) throw new Error(`练习不存在：${id}`);
    exercise.done = done;
    exercise.updatedAt = new Date().toISOString();
    this.persist();
    return clone(exercise);
  }

  /* ------------------------------------------------------------- 复习 */

  async listReviewItems(filter: { state?: string } = {}): Promise<ReviewItemWithNote[]> {
    const items = this.state.reviewItems
      .filter((item) => (filter.state ? item.state === filter.state : true))
      .map((item) => {
        const note = this.state.notes.find((candidate) => candidate.id === item.noteId);
        const course = this.state.courses.find((candidate) => candidate.id === item.courseId);
        return {
          ...item,
          noteTitle: note?.title ?? '笔记已删除',
          courseName: course?.name ?? '未分类',
          courseColorKey: course?.colorKey ?? 'slate',
        };
      });
    return clone(items);
  }

  async applyReviewAction(id: string, action: ReviewAction): Promise<ReviewItem> {
    const item = this.state.reviewItems.find((candidate) => candidate.id === id);
    if (!item) throw new Error(`复习知识点不存在：${id}`);
    const transition = applyReviewAction(item, action);
    Object.assign(item, transition, { updatedAt: new Date().toISOString() });
    this.persist();
    return clone(item);
  }

  /* ------------------------------------------------------------- 设置 */

  async getSettings(): Promise<UserSettings> {
    return clone(this.state.settings);
  }

  async updateSettings(patch: Partial<UserSettings>): Promise<UserSettings> {
    this.state.settings = { ...this.state.settings, ...patch };
    this.persist();
    return clone(this.state.settings);
  }

  /* --------------------------------------------------- 供测试使用的工具 */

  /** 直接读取内部状态（不克隆），仅用于单元测试断言 */
  inspect(): LocalState {
    return this.state;
  }
}


