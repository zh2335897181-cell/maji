import { describe, expect, it } from 'vitest';
import {
  validateGeneratedReviewQuestions,
  validateReviewGrade,
  validateReviewGradingInput,
  validateReviewGenerationInput,
  validateReviewSessionPatch,
} from './validate';

const source = {
  noteId: 'note_python_intro',
  noteTitle: '函数与参数',
  courseName: 'Python 入门',
  contentExcerpt: '函数使用参数接收外部数据。',
  reviewItemIds: ['review_greet'],
};

const question = {
  type: 'code-writing',
  difficulty: 'medium',
  title: '编写问候函数',
  prompt: '请写一个 greet 函数，接收 name 并返回问候语。',
  hint: '使用 f-string。',
  referenceAnswer: 'def greet(name):\n    return f"你好，{name}"',
  explanation: '参数让函数可以处理不同姓名。',
  language: 'python',
  sourceNoteId: 'note_python_intro',
};

describe('AI review IPC validation', () => {
  it('accepts a bounded generation request and code question', () => {
    expect(validateReviewGenerationInput({ sources: [source], depth: 'standard', count: 5, language: 'python' }))
      .toMatchObject({ depth: 'standard', count: 5, sources: [source] });
    expect(validateGeneratedReviewQuestions([question])).toEqual([question]);
  });

  it('rejects unsupported depth, question type, and oversized prompts', () => {
    expect(() => validateReviewGenerationInput({ sources: [source], depth: 'expert', count: 5, language: 'python' }))
      .toThrow('练习深度');
    expect(() => validateGeneratedReviewQuestions([{ ...question, type: 'shell-command' }]))
      .toThrow('题型');
    expect(() => validateGeneratedReviewQuestions([{ ...question, prompt: 'x'.repeat(8_001) }]))
      .toThrow('题目');
  });

  it('accepts score boundaries and rejects scores outside 0 through 100', () => {
    const grade = { score: 0, rationale: '未给出有效答案。', omissions: ['函数定义'], feedback: '再看一下示例。', referenceAnswer: 'def f(): pass', explanation: '函数需要定义。' };
    expect(validateReviewGrade(grade).score).toBe(0);
    expect(validateReviewGrade({ ...grade, score: 100 }).score).toBe(100);
    expect(() => validateReviewGrade({ ...grade, score: -1 })).toThrow('0 到 100');
    expect(() => validateReviewGrade({ ...grade, score: 101 })).toThrow('0 到 100');
  });

  it('rejects empty answers and malformed grading questions', () => {
    expect(validateReviewGradingInput({ question, answer: 'def greet(name): return name' }).answer)
      .toBe('def greet(name): return name');
    expect(() => validateReviewGradingInput({ question, answer: '  ' })).toThrow('答案');
    expect(() => validateReviewGradingInput({ question: { ...question, language: 'brainfuck' }, answer: 'x' }))
      .toThrow('语言');
  });

  it('sorts and merges overlapping active-time segments before persistence', () => {
    const patch = validateReviewSessionPatch({
      activeSegments: [
        { startedAt: '2025-03-04T09:05:00.000Z', endedAt: '2025-03-04T09:12:00.000Z' },
        { startedAt: '2025-03-04T09:00:00.000Z', endedAt: '2025-03-04T09:07:00.000Z' },
      ],
    });
    expect(patch.activeSegments).toEqual([
      { startedAt: '2025-03-04T09:00:00.000Z', endedAt: '2025-03-04T09:12:00.000Z' },
    ]);
  });
});
