/* =============================================================================
   码迹 · 全局数据上下文
   -----------------------------------------------------------------------------
   只放“跨页面共享”的状态：课程、笔记索引、标签、复习、练习、设置、保存状态。
   笔记正文不在这里缓存，由编辑页按需通过 repository.getNote 读取，
   避免打开首页时把整库正文都加载进内存。
   ============================================================================= */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
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
  ReviewItemWithNote,
  SaveState,
  SearchQuery,
  SearchResult,
  Tag,
  UserSettings,
} from '../lib/types';
import { DEFAULT_SETTINGS } from '../lib/types';
import { getRepository } from '../lib/dataSource';
import type { MajiRepository } from '../lib/repository';
import { formatDueLabel, type DueTone } from '../lib/format';

export interface NoteReviewBadge {
  label: string;
  tone: DueTone | 'mastered' | 'none';
  count: number;
}

interface LibraryContextValue {
  loading: boolean;
  error: string | null;
  source: MajiRepository['source'];

  courses: Course[];
  notes: NoteSummary[];
  tags: Tag[];
  reviews: ReviewItemWithNote[];
  exercises: Exercise[];
  snippets: CodeSnippet[];
  settings: UserSettings;
  noteReviewMap: Map<string, NoteReviewBadge>;

  saveState: SaveState;
  setSaveState(patch: Partial<SaveState>): void;

  refresh(): Promise<void>;
  loadNote(id: string): Promise<Note | null>;
  listNotes(filter?: NoteListFilter): Promise<NoteSummary[]>;
  searchNotes(query: SearchQuery): Promise<SearchResult[]>;
  createNote(input: NoteInput): Promise<Note>;
  updateNote(id: string, patch: NotePatch): Promise<Note>;
  deleteNote(id: string): Promise<void>;
  toggleFavorite(noteId: string, favorite: boolean): Promise<void>;
  touchNote(id: string): Promise<void>;

  createCourse(input: Partial<Course> & { name: string }): Promise<Course>;
  updateCourse(id: string, patch: Partial<Course>): Promise<Course>;
  deleteCourse(id: string): Promise<void>;

  createExercise(input: ExerciseInput): Promise<Exercise>;
  toggleExercise(id: string, done: boolean): Promise<void>;
  createSnippet(input: CodeSnippetInput): Promise<CodeSnippet>;

  applyReviewAction(id: string, action: ReviewAction): Promise<ReviewItemWithNote | null>;
  updateSettings(patch: Partial<UserSettings>): Promise<void>;
}

const LibraryContext = createContext<LibraryContextValue | null>(null);

const INITIAL_SAVE_STATE: SaveState = { status: 'idle', savedAt: null, error: null };

export function LibraryProvider({ children }: { children: ReactNode }): ReactNode {
  const repository = useMemo(() => getRepository(), []);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [reviews, setReviews] = useState<ReviewItemWithNote[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [snippets, setSnippets] = useState<CodeSnippet[]>([]);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [saveState, setSaveStateInternal] = useState<SaveState>(INITIAL_SAVE_STATE);

  const refresh = useCallback(async () => {
    try {
      const [
        nextCourses,
        nextNotes,
        nextTags,
        nextReviews,
        nextExercises,
        nextSnippets,
        nextSettings,
      ] = await Promise.all([
        repository.listCourses(),
        repository.listNotes(),
        repository.listTags(),
        repository.listReviewItems(),
        repository.listExercises(),
        repository.listSnippets(20),
        repository.getSettings(),
      ]);
      setCourses(nextCourses);
      setNotes(nextNotes);
      setTags(nextTags);
      setReviews(nextReviews);
      setExercises(nextExercises);
      setSnippets(nextSnippets);
      setSettings(nextSettings);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '读取本地数据失败');
    } finally {
      setLoading(false);
    }
  }, [repository]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setSaveState = useCallback((patch: Partial<SaveState>) => {
    setSaveStateInternal((current) => ({ ...current, ...patch }));
  }, []);

  /** 笔记 → 复习状态徽标：取最近一个未掌握知识点的到期时间 */
  const noteReviewMap = useMemo(() => {
    interface Pending {
      badge: NoteReviewBadge;
      earliest: number;
      hasPending: boolean;
    }
    const pending = new Map<string, Pending>();

    for (const item of reviews) {
      const entry: Pending = pending.get(item.noteId) ?? {
        badge: { label: '未安排', tone: 'none' as const, count: 0 },
        earliest: Number.MAX_SAFE_INTEGER,
        hasPending: false,
      };
      entry.badge = { ...entry.badge, count: entry.badge.count + 1 };

      const isPending = item.state !== 'mastered' && item.state !== 'archived';
      if (isPending) {
        const due = item.dueAt ? new Date(item.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
        if (!entry.hasPending || due < entry.earliest) {
          const label = formatDueLabel(item.dueAt);
          entry.hasPending = true;
          entry.earliest = due;
          entry.badge = { ...entry.badge, label: label.text, tone: label.tone };
        }
      }
      pending.set(item.noteId, entry);
    }

    const map = new Map<string, NoteReviewBadge>();
    for (const [noteId, entry] of pending) {
      map.set(
        noteId,
        entry.hasPending ? entry.badge : { ...entry.badge, label: '已掌握', tone: 'mastered' },
      );
    }
    return map;
  }, [reviews]);

  /* ------------------------------------------------------------ 笔记操作 */

  const loadNote = useCallback((id: string) => repository.getNote(id), [repository]);
  const listNotes = useCallback(
    (filter?: NoteListFilter) => repository.listNotes(filter),
    [repository],
  );

  const searchNotes = useCallback(
    (query: SearchQuery) => repository.searchNotes(query),
    [repository],
  );

  const createNote = useCallback(
    async (input: NoteInput) => {
      const note = await repository.createNote(input);
      await refresh();
      return note;
    },
    [repository, refresh],
  );

  const updateNote = useCallback(
    async (id: string, patch: NotePatch) => {
      const note = await repository.updateNote(id, patch);
      // 标题 / 收藏 / 标签变化要反映到列表上；正文变化不影响索引，做一次轻量同步
      if (
        patch.title !== undefined ||
        patch.favorite !== undefined ||
        patch.tags !== undefined ||
        patch.courseId !== undefined ||
        patch.language !== undefined
      ) {
        await refresh();
      } else {
        setNotes((current) =>
          current.map((item) =>
            item.id === id ? { ...item, updatedAt: note.updatedAt, excerpt: note.excerpt } : item,
          ),
        );
      }
      return note;
    },
    [repository, refresh],
  );

  const deleteNote = useCallback(
    async (id: string) => {
      await repository.deleteNote(id);
      setSettings((current) =>
        current.lastOpenedNoteId === id ? { ...current, lastOpenedNoteId: null } : current,
      );
      await refresh();
    },
    [repository, refresh],
  );

  const toggleFavorite = useCallback(
    async (noteId: string, favorite: boolean) => {
      setNotes((current) =>
        current.map((item) => (item.id === noteId ? { ...item, favorite } : item)),
      );
      try {
        await repository.updateNote(noteId, { favorite });
      } catch (cause) {
        setNotes((current) =>
          current.map((item) => (item.id === noteId ? { ...item, favorite: !favorite } : item)),
        );
        throw cause;
      }
    },
    [repository],
  );

  const touchNote = useCallback(
    async (id: string) => {
      await repository.touchNote(id);
      const nextSettings = await repository.getSettings();
      setSettings(nextSettings);
    },
    [repository],
  );

  /* ------------------------------------------------------------ 课程操作 */

  const createCourse = useCallback(
    async (input: Partial<Course> & { name: string }) => {
      const course = await repository.createCourse(input);
      await refresh();
      return course;
    },
    [repository, refresh],
  );

  const updateCourse = useCallback(
    async (id: string, patch: Partial<Course>) => {
      const course = await repository.updateCourse(id, patch);
      await refresh();
      return course;
    },
    [repository, refresh],
  );

  const deleteCourse = useCallback(
    async (id: string) => {
      await repository.deleteCourse(id);
      await refresh();
    },
    [repository, refresh],
  );

  /* -------------------------------------------------- 练习 / 片段 / 复习 */

  const createExercise = useCallback(
    async (input: ExerciseInput) => {
      const exercise = await repository.createExercise(input);
      await refresh();
      return exercise;
    },
    [repository, refresh],
  );

  const toggleExercise = useCallback(
    async (id: string, done: boolean) => {
      setExercises((current) => current.map((item) => (item.id === id ? { ...item, done } : item)));
      await repository.toggleExercise(id, done);
      await refresh();
    },
    [repository, refresh],
  );

  const createSnippet = useCallback(
    async (input: CodeSnippetInput) => {
      const snippet = await repository.createSnippet(input);
      await refresh();
      return snippet;
    },
    [repository, refresh],
  );

  const applyReviewAction = useCallback(
    async (id: string, action: ReviewAction) => {
      const updated = await repository.applyReviewAction(id, action);
      const nextReviews = await repository.listReviewItems();
      setReviews(nextReviews);
      const withNote = nextReviews.find((item) => item.id === id);
      return withNote ?? { ...updated, noteTitle: '', courseName: '', courseColorKey: 'slate' as const };
    },
    [repository],
  );

  const updateSettings = useCallback(
    async (patch: Partial<UserSettings>) => {
      const next = await repository.updateSettings(patch);
      setSettings(next);
    },
    [repository],
  );

  const value = useMemo<LibraryContextValue>(
    () => ({
      loading,
      error,
      source: repository.source,
      courses,
      notes,
      tags,
      reviews,
      exercises,
      snippets,
      settings,
      noteReviewMap,
      saveState,
      setSaveState,
      refresh,
      loadNote,
      listNotes,
      searchNotes,
      createNote,
      updateNote,
      deleteNote,
      toggleFavorite,
      touchNote,
      createCourse,
      updateCourse,
      deleteCourse,
      createExercise,
      toggleExercise,
      createSnippet,
      applyReviewAction,
      updateSettings,
    }),
    [
      loading,
      error,
      repository.source,
      courses,
      notes,
      tags,
      reviews,
      exercises,
      snippets,
      settings,
      noteReviewMap,
      saveState,
      setSaveState,
      refresh,
      loadNote,
      listNotes,
      searchNotes,
      createNote,
      updateNote,
      deleteNote,
      toggleFavorite,
      touchNote,
      createCourse,
      updateCourse,
      deleteCourse,
      createExercise,
      toggleExercise,
      createSnippet,
      applyReviewAction,
      updateSettings,
    ],
  );

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary(): LibraryContextValue {
  const context = useContext(LibraryContext);
  if (!context) throw new Error('useLibrary 必须在 LibraryProvider 内使用');
  return context;
}

/** 单篇笔记的摘要信息 */
export function useNoteSummary(noteId: string | undefined): NoteSummary | undefined {
  const { notes } = useLibrary();
  return useMemo(() => notes.find((note) => note.id === noteId), [notes, noteId]);
}

export function useCourse(courseId: string | undefined): Course | undefined {
  const { courses } = useLibrary();
  return useMemo(() => courses.find((course) => course.id === courseId), [courses, courseId]);
}
