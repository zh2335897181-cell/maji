import { beforeEach, describe, expect, it } from 'vitest';
import { LocalRepository } from './localRepository';
import { createSeedData } from './demoData';
import { isDueNow } from './review';

const NOW = new Date('2025-03-04T15:30:00');

let repo: LocalRepository;

beforeEach(() => {
  repo = new LocalRepository({ ...createSeedData(NOW), version: 1 });
});

describe('课程数据操作', () => {
  it('示例数据包含 4 门课程与 15 篇笔记', async () => {
    expect(await repo.listCourses()).toHaveLength(4);
    expect(await repo.listNotes()).toHaveLength(15);
  });

  it('新建课程后排在最后，并能改名', async () => {
    const course = await repo.createCourse({ name: '数据库原理', language: 'java' });
    expect(course.sortOrder).toBe(4);

    const renamed = await repo.updateCourse(course.id, { name: '数据库系统' });
    expect(renamed.name).toBe('数据库系统');

    const courses = await repo.listCourses();
    expect(courses[courses.length - 1]?.name).toBe('数据库系统');
  });

  it('保存技术框架方向，并按方向设置新笔记默认语言', async () => {
    const course = await repo.createCourse({ name: 'Spring Boot 入门', track: 'springboot' });
    expect(course).toMatchObject({ track: 'springboot', language: 'java' });
  });

  it('课程下还有笔记时拒绝删除，并说明原因', async () => {
    await expect(repo.deleteCourse('course_python')).rejects.toThrow('该课程下还有 6 篇笔记');
  });

  it('空课程可以删除', async () => {
    const course = await repo.createCourse({ name: '临时课程' });
    await repo.deleteCourse(course.id);
    expect((await repo.listCourses()).some((item) => item.id === course.id)).toBe(false);
  });

  it('课程顺序可以调整', async () => {
    await repo.reorderCourses(['course_algo', 'course_python']);
    const courses = await repo.listCourses();
    expect(courses[0]?.id).toBe('course_algo');
    expect(courses[1]?.id).toBe('course_python');
  });
});

describe('笔记数据操作', () => {
  it('列表按更新时间倒序，并带上课程名', async () => {
    const notes = await repo.listNotes();
    const times = notes.map((note) => new Date(note.updatedAt).getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect(notes[0]?.courseName).toBeTruthy();
  });

  it('正文不进入列表投影', async () => {
    const notes = await repo.listNotes();
    expect(notes[0]).not.toHaveProperty('contentJson');
    expect(notes[0]).not.toHaveProperty('contentText');
  });

  it('更新正文会同步纯文本与摘要', async () => {
    const content = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '新的正文内容，用来验证同步。' }] }],
    };
    const updated = await repo.updateNote('note_func_args', { contentJson: JSON.stringify(content) });
    expect(updated.contentText).toContain('新的正文内容');
    expect(updated.excerpt).toBe('新的正文内容，用来验证同步。');
  });

  it('按课程、标签、收藏筛选', async () => {
    expect(await repo.listNotes({ courseId: 'course_python' })).toHaveLength(6);
    expect(await repo.listNotes({ tag: '布局' })).toHaveLength(2);
    expect(await repo.listNotes({ favorite: true })).toHaveLength(3);
    expect(await repo.listNotes({ language: 'java' })).toHaveLength(3);
  });

  it('收藏状态可以来回切换', async () => {
    await repo.updateNote('note_variables', { favorite: true });
    expect((await repo.getNote('note_variables'))?.favorite).toBe(true);
    await repo.updateNote('note_variables', { favorite: false });
    expect((await repo.getNote('note_variables'))?.favorite).toBe(false);
  });

  it('删除笔记会同时清掉它的复习知识点', async () => {
    await repo.deleteNote('note_func_args');
    expect(await repo.getNote('note_func_args')).toBeNull();
    const reviews = await repo.listReviewItems();
    expect(reviews.some((item) => item.noteId === 'note_func_args')).toBe(false);
  });

  it('打开笔记会更新最近记录并保持在 6 条以内', async () => {
    await repo.touchNote('note_import');
    const settings = await repo.getSettings();
    expect(settings.lastOpenedNoteId).toBe('note_import');
    expect(settings.recentNoteIds[0]).toBe('note_import');
    expect(settings.recentNoteIds.length).toBeLessThanOrEqual(6);
    expect(settings.recentNoteIds.filter((id) => id === 'note_import')).toHaveLength(1);
  });

  it('新建笔记会带上初始正文与摘要', async () => {
    const note = await repo.createNote({
      courseId: 'course_python',
      title: '装饰器入门',
      language: 'python',
      tags: ['Python'],
    });
    expect(note.title).toBe('装饰器入门');
    expect(note.contentText).toContain('在这里开始记录');
    expect(note.excerpt.length).toBeGreaterThan(0);
    expect((await repo.listNotes({ courseId: 'course_python' })).length).toBe(7);
  });

  it('标签统计按出现次数排序', async () => {
    const tags = await repo.listTags();
    expect(tags[0]?.name).toBe('Python');
    expect(tags[0]?.noteCount).toBe(6);
  });
});

describe('搜索数据操作', () => {
  it('能搜到正文里的中文关键词', async () => {
    const results = await repo.searchNotes({ text: '形参' });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.noteId).toBe('note_func_args');
  });

  it('能搜到代码块里的关键词', async () => {
    const results = await repo.searchNotes({ text: 'range' });
    expect(results.some((item) => item.hitField === 'code' || item.hitField === 'body')).toBe(true);
  });

  it('搜索无结果时返回空数组而不是报错', async () => {
    expect(await repo.searchNotes({ text: '装饰器原理' })).toEqual([]);
  });
});

describe('复习与练习', () => {
  it('示例数据里有 3 个今天待复习的知识点，函数与参数安排在明天', async () => {
    const reviews = await repo.listReviewItems();
    expect(reviews.filter((item) => isDueNow(item, NOW))).toHaveLength(3);

    const functionNoteReviews = reviews.filter((item) => item.noteId === 'note_func_args');
    expect(functionNoteReviews).toHaveLength(2);
    for (const item of functionNoteReviews) {
      expect(isDueNow(item, NOW)).toBe(false);
      expect(new Date(item.dueAt as string).getDate()).toBe(5); // 明天
    }
  });

  it('复习操作会更新状态与下次时间', async () => {
    // 「函数与参数」的知识点安排在明天，属于已排期而非今天待复习
    const before = (await repo.listReviewItems()).find((item) => item.id === 'review_param_arg');
    expect(before?.state).toBe('scheduled');

    const after = await repo.applyReviewAction('review_param_arg', 'mastered');
    expect(after.state).toBe('scheduled');
    expect(after.reviewCount).toBe((before?.reviewCount ?? 0) + 1);
    expect(after.dueAt).not.toBeNull();
    expect(new Date(after.dueAt as string).getTime()).toBeGreaterThan(
      new Date(before?.dueAt as string).getTime(),
    );
  });

  it('不存在的知识点会抛出可读错误', async () => {
    await expect(repo.applyReviewAction('review_missing', 'mastered')).rejects.toThrow(
      '复习知识点不存在',
    );
  });

  it('练习题可以勾选完成，也能按笔记筛选', async () => {
    const noteExercises = await repo.listExercises({ noteId: 'note_func_args' });
    expect(noteExercises).toHaveLength(1);

    const updated = await repo.toggleExercise(noteExercises[0]!.id, true);
    expect(updated.done).toBe(true);
  });

  it('代码片段可以保存并按更新时间排序', async () => {
    const snippet = await repo.createSnippet({
      title: '读取文件',
      language: 'python',
      code: 'with open("a.txt") as f:\n    print(f.read())',
      description: '用 with 自动关闭文件',
    });
    const snippets = await repo.listSnippets();
    expect(snippets[0]?.id).toBe(snippet.id);
  });
});

describe('设置与持久化', () => {
  it('设置可以局部更新', async () => {
    const next = await repo.updateSettings({ theme: 'dark', editorFontSize: 16 });
    expect(next.theme).toBe('dark');
    expect(next.editorFontSize).toBe(16);
    expect((await repo.getSettings()).theme).toBe('dark');
  });

  it('数据写入 localStorage，同一个仓库实例读回一致', async () => {
    await repo.updateSettings({ editorFontSize: 17 });
    const restored = new LocalRepository();
    expect((await restored.getSettings()).editorFontSize).toBe(17);
  });

  it('reset 会把示例数据恢复原状', async () => {
    await repo.deleteNote('note_html');
    expect(await repo.getNote('note_html')).toBeNull();
    repo.reset(NOW);
    expect(await repo.getNote('note_html')).not.toBeNull();
  });
});

describe('AI 复习会话', () => {
  it('保存会话与答案、评分，且来源笔记删除后历史快照仍可读', async () => {
    const source = {
      noteId: 'note_func_args',
      noteTitle: '函数与参数',
      courseName: 'Python 入门',
      contentExcerpt: '函数可以接收参数并返回结果。',
      reviewItemIds: ['review_param_arg'],
    };
    const session = await repo.reviewSessions.create({
      scope: 'notes',
      depth: 'standard',
      plannedQuestionCount: 1,
      sources: [source],
      questions: [{
        type: 'code-writing',
        difficulty: 'easy',
        title: '编写 greet',
        prompt: '编写接收 name 并返回问候语的函数。',
        hint: '使用参数。',
        referenceAnswer: 'def greet(name): return name',
        explanation: '参数可接收调用方提供的数据。',
        language: 'python',
        sourceNoteId: source.noteId,
      }],
    });
    expect(session.status).toBe('in-progress');
    expect(session.questions).toHaveLength(1);

    const questionId = session.questions[0]!.id;
    await repo.reviewSessions.saveAnswer(session.id, { questionId, answer: 'def greet(name): return name' });
    await repo.reviewSessions.saveGrade(session.id, {
      questionId,
      grade: { score: 90, rationale: '满足要求。', omissions: [], feedback: '不错。', referenceAnswer: 'def greet(name): return name', explanation: '参数接收姓名。' },
    });
    const activeStart = new Date(session.startedAt);
    const activeEnd = new Date(activeStart.getTime() + 12 * 60 * 1000);
    const completed = await repo.reviewSessions.update(session.id, {
      status: 'completed',
      endedAt: activeEnd.toISOString(),
      activeSegments: [{ startedAt: activeStart.toISOString(), endedAt: activeEnd.toISOString() }],
    });
    expect(completed).toMatchObject({ durationSeconds: 720, averageScore: 90 });

    await repo.updateNote('note_func_args', { title: '改名后的函数笔记' });
    await repo.deleteNote('note_func_args');
    const restored = await new LocalRepository().reviewSessions.get(session.id);
    expect(restored?.sources[0]?.noteTitle).toBe('函数与参数');
    expect(restored?.questions[0]?.grade?.score).toBe(90);
    const date = new Date(session.startedAt);
    const localDay = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    expect(await repo.reviewSessions.list({ fromDate: localDay, toDate: localDay })).toHaveLength(1);
  });
});
