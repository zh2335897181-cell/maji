import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as library from './library';
import { closeDatabase, openDatabase } from './connection';
import { deleteNote } from './notes';

const source = {
  noteId: 'note_func_args',
  noteTitle: '函数与参数',
  courseName: 'Python 入门',
  contentExcerpt: '函数接收参数并返回结果。',
  reviewItemIds: ['review_param_arg'],
};

const question = {
  type: 'code-writing' as const,
  difficulty: 'easy' as const,
  title: '编写 greet',
  prompt: '编写接收 name 并返回问候语的函数。',
  hint: '使用参数。',
  referenceAnswer: 'def greet(name): return name',
  explanation: '参数接收调用方提供的数据。',
  language: 'python' as const,
  sourceNoteId: source.noteId,
};

beforeEach(() => {
  openDatabase(':memory:');
});

afterEach(() => {
  closeDatabase();
});

describe('SQLite AI review sessions', () => {
  it('persists a session, answer, grade, active duration, and note snapshot atomically', () => {
    const created = library.createReviewSession({
      scope: 'notes',
      depth: 'standard',
      plannedQuestionCount: 1,
      sources: [source],
      questions: [question],
    });
    const questionId = created.questions[0]!.id;
    library.saveReviewQuestionAnswer(created.id, { questionId, answer: 'def greet(name): return name' });
    library.saveReviewQuestionGrade(created.id, {
      questionId,
      grade: { score: 90, rationale: '符合要求。', omissions: [], feedback: '不错。', referenceAnswer: question.referenceAnswer, explanation: question.explanation },
    });
    const end = new Date(Date.parse(created.startedAt) + 720_000).toISOString();
    const updated = library.updateReviewSession(created.id, {
      status: 'completed',
      endedAt: end,
      activeSegments: [{ startedAt: created.startedAt, endedAt: end }],
      activeSegmentStartedAt: null,
    });

    expect(updated).toMatchObject({ durationSeconds: 720, averageScore: 90 });
    deleteNote('note_func_args');
    const restored = library.getReviewSession(created.id);
    expect(restored?.sources[0]?.noteTitle).toBe('函数与参数');
    expect(restored?.questions[0]).toMatchObject({ answer: 'def greet(name): return name', grade: { score: 90 } });
    expect(library.listReviewSessions({ status: 'completed' })).toHaveLength(1);
  });
});
