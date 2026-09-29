import { describe, expect, it } from 'vitest';
import {
  validateAIAction,
  validateAIContext,
  validateAPIKey,
  validateProviderSettings,
  validateProviderUrl,
} from './validation';

describe('AI input validation', () => {
  it.each([
    ['https://api.deepseek.com/v1', 'https://api.deepseek.com/v1'],
    ['http://localhost:11434/v1/', 'http://localhost:11434/v1'],
    ['http://127.0.0.1:1234', 'http://127.0.0.1:1234'],
    ['http://[::1]:1234/v1', 'http://[::1]:1234/v1'],
  ])('normalizes accepted provider URL %s', (url, normalized) => {
    expect(validateProviderUrl(url)).toBe(normalized);
  });

  it.each([
    'http://example.com/v1',
    'file:///tmp/secrets',
    'https://user:pass@example.com/v1',
    'https://example.com/v1#fragment',
    'https://example.com/v1?token=secret',
  ])('rejects unsafe provider URL %s', (url) => {
    expect(() => validateProviderUrl(url)).toThrow();
  });

  it('validates provider settings and rejects blank or oversized values', () => {
    expect(validateProviderSettings({ baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' })).toEqual({
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
    });
    expect(() => validateProviderSettings({ baseUrl: 'https://api.deepseek.com', model: ' ' })).toThrow();
    expect(() => validateProviderSettings({ baseUrl: 'https://api.deepseek.com', model: 'x'.repeat(201) })).toThrow();
  });

  it('validates the secret without trimming or accepting empty keys', () => {
    expect(validateAPIKey('sk-test-secret')).toBe('sk-test-secret');
    expect(() => validateAPIKey(' ')).toThrow();
    expect(() => validateAPIKey('x'.repeat(4097))).toThrow();
    expect(() => validateAPIKey('sk-test\r\nInjected: true')).toThrow();
  });

  it('enforces context scope and the 12,000 UTF-16 unit limit without truncation', () => {
    expect(() => validateAIContext({ scope: 'selection', selectedText: '', language: 'python' })).toThrow();
    expect(() => validateAIContext({ scope: 'selection', selectedText: 'x'.repeat(12001), language: 'python' })).toThrow();
    expect(() => validateAIContext({ scope: 'selection', selectedText: '😀'.repeat(6001), language: 'python' })).toThrow();
    expect(() => validateAIContext({ scope: 'note', selectedText: 'x', language: 'python' })).toThrow();
    expect(
      validateAIContext({ scope: 'note', selectedText: 'x', noteText: 'whole note', language: 'python' }),
    ).toMatchObject({ scope: 'note', noteText: 'whole note' });
  });

  it('accepts only known AI actions', () => {
    expect(validateAIAction('explain')).toBe('explain');
    expect(validateAIAction('continue')).toBe('continue');
    expect(() => validateAIAction('anything')).toThrow();
  });

  it('validates bounded continuation context for prose and code', () => {
    expect(validateAIContext({
      scope: 'completion', selectedText: '', language: 'python',
      continuation: { before: 'def greet(name):', after: '', code: true },
    })).toMatchObject({ scope: 'completion', continuation: { before: 'def greet(name):', code: true } });
    expect(validateAIContext({
      scope: 'completion', selectedText: '', language: 'text',
      continuation: { before: '函数可以复用一段逻辑', after: '并接收参数', code: false },
    })).toMatchObject({ continuation: { code: false } });
    expect(() => validateAIContext({
      scope: 'completion', selectedText: '', language: 'python',
      continuation: { before: '', after: '', code: true },
    })).toThrow();
    expect(() => validateAIContext({
      scope: 'completion', selectedText: '', language: 'python',
      continuation: { before: 'x'.repeat(12001), after: '', code: true },
    })).toThrow();
  });
});
