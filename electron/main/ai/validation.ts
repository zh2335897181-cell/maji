import type { LanguageId } from '../../../src/lib/types';
import type { AIAction, AIContext, AIProviderSettings } from './types';

const MAX_INPUT_UNITS = 12_000;
const MAX_MODEL_UNITS = 200;
const MAX_KEY_UNITS = 4_096;
const LANGUAGES = new Set<LanguageId>([
  'python', 'javascript', 'typescript', 'html', 'css', 'java', 'c', 'text',
]);

function record(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(message);
  return value as Record<string, unknown>;
}

function nonEmptyString(value: unknown, max: number, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    throw new Error(`${label}不能为空且不能超过 ${max} 个字符`);
  }
  return value;
}

export function validateProviderUrl(value: unknown): string {
  const raw = nonEmptyString(value, 2_048, '接口地址').trim();
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('接口地址格式无效');
  }
  if (url.username || url.password || url.hash || url.search) throw new Error('接口地址不能包含账号、密码、查询参数或片段');
  if (url.protocol === 'https:') {
    // HTTPS endpoints may be remote; only fixed endpoints are appended by the main process.
  } else if (
    url.protocol !== 'http:' ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname.toLowerCase())
  ) {
    throw new Error('仅支持 HTTPS 服务；HTTP 仅允许本机回环地址');
  }
  return url.toString().replace(/\/+$/, '');
}

export function validateProviderSettings(value: unknown): AIProviderSettings {
  const input = record(value, 'AI 服务设置格式无效');
  return {
    baseUrl: validateProviderUrl(input.baseUrl),
    model: nonEmptyString(input.model, MAX_MODEL_UNITS, '模型名称').trim(),
  };
}

export function validateAPIKey(value: unknown): string {
  const key = nonEmptyString(value, MAX_KEY_UNITS, 'API 密钥');
  if (!key.trim()) throw new Error('API 密钥不能为空');
  if (/[\u0000-\u001F\u007F]/.test(key)) throw new Error('API 密钥不能包含控制字符');
  return key;
}

export function validateAIAction(value: unknown): AIAction {
  if (value === 'explain' || value === 'organize' || value === 'exercise') return value;
  throw new Error('AI 操作无效');
}

export function validateAIContext(value: unknown): AIContext {
  const input = record(value, 'AI 上下文格式无效');
  const selectedText = nonEmptyString(input.selectedText, MAX_INPUT_UNITS, '所选内容');
  if (input.scope !== 'selection' && input.scope !== 'note') throw new Error('上下文范围无效');
  if (typeof input.language !== 'string' || !LANGUAGES.has(input.language as LanguageId)) {
    throw new Error('编程语言无效');
  }
  if (input.scope === 'selection') return { selectedText, scope: 'selection', language: input.language as LanguageId };
  const noteText = nonEmptyString(input.noteText, MAX_INPUT_UNITS, '笔记内容');
  return { selectedText, noteText, scope: 'note', language: input.language as LanguageId };
}
