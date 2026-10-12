import { describe, expect, it, vi } from 'vitest';
import { AIClient } from './client';
import { newQuestion, validateExamAIRequest } from '../../../src/lib/exams';
const settings = { baseUrl: 'https://example.test/v1', model: 'deepseekv4flash' };
function response(value: unknown) {
  return new Response(
    JSON.stringify({
      choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(value) } }],
    }),
  );
}
const analysis = {
  summary: '参数未传递到服务层',
  steps: ['沿 Controller 和 Service 核对参数'],
  answer: '传递 id',
  pitfalls: ['遗漏参数'],
  missing: [],
  concepts: [],
  refs: [],
  assessment: 'partial',
};
describe('考试 AI', () => {
  it('发送真实层级资料并验证文件行号引用', async () => {
    const question = newQuestion();
    question.files = [
      {
        id: 'file_1',
        path: 'controller/Emp.java',
        role: 'Controller',
        language: 'java',
        content: 'service.list();',
      },
    ];
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        response({
          ...analysis,
          refs: [
            {
              questionId: question.id,
              path: 'controller/Emp.java',
              line: 1,
              quote: 'service.list();',
            },
          ],
        }),
      );
    const input = validateExamAIRequest({
      operation: 'analyze',
      questions: [question],
      level: 'basic',
      count: 1,
    });
    const result = await new AIClient({ fetch: fetcher }).analyzeExam(settings, 'test-key', input);
    expect(result).toMatchObject({ assessment: 'partial' });
    const payload = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(payload.thinking).toEqual({ type: 'disabled' });
    expect(JSON.parse(payload.messages[1].content).SOURCE_DATA[0].files[0].role).toBe('Controller');
  });
  it('给训练题分配本地 ID，不能预填答案，综合题必须跨层', async () => {
    const question = newQuestion();
    question.status = 'wrong';
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      response([
        {
          title: '修复调用链',
          prompt: '补充参数',
          topic: '参数传递',
          sourceQuestionIds: [question.id],
          files: [
            { path: 'Controller.java', role: 'Controller', language: 'java', content: '// TODO' },
            { path: 'Service.java', role: 'Service', language: 'java', content: '// TODO' },
          ],
          referenceAnswer: '传递 id',
          explanation: '保持参数一致',
        },
      ]),
    );
    const result = await new AIClient({ fetch: fetcher }).analyzeExam(
      settings,
      'test-key',
      validateExamAIRequest({
        operation: 'train',
        questions: [question],
        level: 'project',
        count: 1,
      }),
    );
    expect(Array.isArray(result)).toBe(true);
    if (Array.isArray(result)) {
      expect(result[0]?.answer).toBe('');
      expect(result[0]?.files).toHaveLength(2);
      expect(result[0]?.submittedAt).toBeNull();
    }
  });
  it('拒绝伪造代码证据和无效结构，不将半成品保存', async () => {
    const question = newQuestion();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        response({
          ...analysis,
          refs: [{ questionId: question.id, path: 'missing.java', line: 1, quote: 'foo' }],
        }),
      );
    await expect(
      new AIClient({ fetch: fetcher }).analyzeExam(
        settings,
        'test-key',
        validateExamAIRequest({
          operation: 'analyze',
          questions: [question],
          level: 'basic',
          count: 1,
        }),
      ),
    ).rejects.toThrow('引用');
  });
});
