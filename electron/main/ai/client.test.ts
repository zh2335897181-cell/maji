import { describe, expect, it, vi } from 'vitest';
import { AIClient } from './client';
import type { AIContext } from './types';

const settings = { baseUrl: 'https://provider.example/v1', model: 'demo-model' };
const context: AIContext = { selectedText: 'print(1 + 1)', scope: 'selection', language: 'python' };

function completion(content: string, status = 200): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status });
}

describe('OpenAI-compatible client', () => {
  it('sends selected-only explain requests to fixed chat endpoint with authorization', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(completion('输出 2'));
    const client = new AIClient({ fetch: fetcher });
    await expect(client.ask(settings, 'sk-secret', 'explain', context)).resolves.toEqual({ kind: 'text', text: '输出 2' });
    const [url, init] = fetcher.mock.calls[0];
    expect(String(url)).toBe('https://provider.example/v1/chat/completions');
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer sk-secret');
    expect(init?.redirect).toBe('error');
    const payload = JSON.parse(String(init?.body));
    expect(JSON.stringify(payload)).toContain('print(1 + 1)');
    expect(JSON.stringify(payload)).not.toContain('noteText');
  });

  it('uses whole-note context only when explicitly selected', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(completion('说明'));
    await new AIClient({ fetch: fetcher }).ask(
      settings,
      'key',
      'explain',
      { ...context, scope: 'note', noteText: '整篇笔记正文' },
    );
    expect(JSON.stringify(JSON.parse(String(fetcher.mock.calls[0][1]?.body)))).toContain('整篇笔记正文');
  });

  it('requests a continuation using nearby prose or code and only returns the suggestion', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(completion('return f"你好，{name}！"'));
    await expect(new AIClient({ fetch: fetcher }).ask(settings, 'key', 'continue', {
      selectedText: '', scope: 'completion', language: 'python',
      continuation: { before: 'def greet(name):\n    ', after: '', code: true },
    })).resolves.toEqual({ kind: 'text', text: 'return f"你好，{name}！"' });
    const payload = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(JSON.stringify(payload)).toContain('def greet(name):');
    expect(JSON.stringify(payload)).toContain('Python');
    expect(JSON.stringify(payload)).toContain('只输出');
  });

  it('tests connections using only GET /models', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 200 }));
    await new AIClient({ fetch: fetcher }).testConnection(settings, 'key');
    expect(String(fetcher.mock.calls[0][0])).toBe('https://provider.example/v1/models');
    expect(fetcher.mock.calls[0][1]?.method).toBe('GET');
  });

  it('rejects redirect responses and never forwards credentials through a redirect', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('redirect to https://attacker.invalid'));
    await expect(new AIClient({ fetch: fetcher }).testConnection(settings, 'sk-secret')).rejects.toThrow('连接失败');
    expect(fetcher.mock.calls[0][1]?.redirect).toBe('error');
  });

  it('enforces timeout and maps throttling without leaking provider details', async () => {
    const throttled = vi.fn<typeof fetch>().mockResolvedValue(new Response('secret response', { status: 429 }));
    await expect(new AIClient({ fetch: throttled }).testConnection(settings, 'sk-secret')).rejects.toThrow('请求过于频繁');
    const slow = vi.fn<typeof fetch>().mockImplementation((_input, init) =>
      new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))),
    );
    await expect(new AIClient({ fetch: slow, timeoutMs: 5 }).testConnection(settings, 'sk-secret')).rejects.toThrow('超时');
  });

  it('reports a timeout while reading a slow response body', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation((_input, init) => Promise.resolve(new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          init?.signal?.addEventListener('abort', () => controller.error(new DOMException('aborted', 'AbortError')));
        },
      }),
      { status: 200 },
    )));
    await expect(new AIClient({ fetch: fetcher, timeoutMs: 5 }).testConnection(settings, 'key')).rejects.toThrow('超时');
  });

  it('rejects oversized and malformed responses and sanitizes provider errors', async () => {
    const hugeBody = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(16)); controller.close(); },
    });
    const oversized = vi.fn<typeof fetch>().mockResolvedValue(new Response(hugeBody));
    await expect(new AIClient({ fetch: oversized, maxResponseBytes: 8 }).testConnection(settings, 'key')).rejects.toThrow('响应内容过大');
    const malformed = vi.fn<typeof fetch>().mockResolvedValue(new Response('not json'));
    await expect(new AIClient({ fetch: malformed }).ask(settings, 'key', 'explain', context)).rejects.toThrow('响应格式无效');
    const failure = vi.fn<typeof fetch>().mockResolvedValue(new Response('sk-secret https://provider.example private body', { status: 500 }));
    const error = await new AIClient({ fetch: failure }).testConnection(settings, 'sk-secret').catch((e: Error) => e.message);
    expect(error).not.toContain('sk-secret');
    expect(error).not.toContain('provider.example');
    expect(error).not.toContain('private body');
  });

  it('validates exercise JSON schema, field sizes, and output length', async () => {
    const valid = JSON.stringify({ title: '练习标题', prompt: '实现一个函数', hint: '使用循环', solution: 'def f(): pass' });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(completion(valid));
    await expect(new AIClient({ fetch: fetcher }).ask(settings, 'key', 'exercise', context)).resolves.toMatchObject({ kind: 'exercise', title: '练习标题' });
    const invalid = vi.fn<typeof fetch>().mockResolvedValue(completion('{"title":"x","prompt":"","hint":"h","solution":"s"}'));
    await expect(new AIClient({ fetch: invalid }).ask(settings, 'key', 'exercise', context)).rejects.toThrow('练习题格式无效');
    const oversizedExercise = vi.fn<typeof fetch>().mockResolvedValue(completion(`${valid}${' '.repeat(16_001)}`));
    await expect(new AIClient({ fetch: oversizedExercise }).ask(settings, 'key', 'exercise', context)).rejects.toThrow('输出内容过长');
    const tooLong = vi.fn<typeof fetch>().mockResolvedValue(completion('x'.repeat(16_001)));
    await expect(new AIClient({ fetch: tooLong }).ask(settings, 'key', 'explain', context)).rejects.toThrow('输出内容过长');
  });
});
