import { describe, expect, it } from 'vitest';
import { questionContext } from './exams';
import {
  newExam,
  newQuestion,
  validateExam,
  validateExamAIRequest,
  validateExamAIResult,
} from './exams';
describe('考试文档与 AI 边界', () => {
  it('未选文件只发送目录信息，不发送代码正文', () => {
    const question = newQuestion();
    question.files = [
      {
        id: 'file_private',
        path: 'config/application.yml',
        role: '配置',
        language: 'yml',
        content: 'private-config-value',
        includeInAI: false,
      },
    ];
    const context = questionContext(question);
    expect(context.files).toEqual([]);
    expect(context.fileManifest).toEqual([
      { path: 'config/application.yml', role: '配置', provided: false },
    ]);
    expect(JSON.stringify(context)).not.toContain('private-config-value');
  });
  it('保留多层文件、原始答案和独立订正', () => {
    const exam = newExam('阶段考试');
    const question = newQuestion();
    question.files = [
      {
        id: 'file_1',
        path: 'controller/Emp.java',
        role: 'Controller',
        language: 'java',
        content: 'return service.list();',
      },
    ];
    question.originalAnswer = '原始答案';
    question.correction = '订正';
    exam.questions.push(question);
    expect(validateExam(exam)).toEqual(exam);
  });
  it('拒绝重复路径、越界文件和伪造引用', () => {
    const exam = newExam('考试');
    const question = newQuestion();
    const file = {
      id: 'file_1',
      path: 'A.java',
      role: '其他',
      language: 'java',
      content: 'class A {}',
    };
    question.files = [file, { ...file, id: 'file_2' }];
    exam.questions.push(question);
    expect(() => validateExam(exam)).toThrow();
    question.files = [file];
    const request = validateExamAIRequest({
      operation: 'analyze',
      questions: [question],
      level: 'basic',
      count: 1,
    });
    expect(() =>
      validateExamAIResult(
        {
          summary: '分析',
          answer: '答案',
          steps: [],
          pitfalls: [],
          missing: [],
          concepts: [],
          refs: [{ questionId: question.id, path: 'A.java', line: 8, quote: '不存在' }],
          assessment: 'unknown',
        },
        request,
      ),
    ).toThrow();
  });
  it('弱项只使用错题，过大上下文不截断发送', () => {
    const question = newQuestion();
    question.prompt = 'x'.repeat(120001);
    expect(() =>
      validateExamAIRequest({
        operation: 'analyze',
        questions: [question],
        level: 'basic',
        count: 1,
      }),
    ).toThrow();
  });
});
