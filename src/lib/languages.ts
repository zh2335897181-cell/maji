/* =============================================================================
   码迹 · 编程语言元数据（界面用）
   -----------------------------------------------------------------------------
   id 必须与 Shiki 的语言标识一致，保证高亮与筛选使用同一套取值。
   ============================================================================= */

import type { LanguageId } from './types';

export interface LanguageOption {
  value: LanguageId;
  label: string;
  /** 新建代码片段时的默认文件名提示 */
  extension: string;
  /** 用于标签着色的语气 */
  tone: 'accent' | 'success' | 'warning' | 'neutral';
}

export const LANGUAGES: LanguageOption[] = [
  { value: 'python', label: 'Python', extension: 'py', tone: 'accent' },
  { value: 'javascript', label: 'JavaScript', extension: 'js', tone: 'warning' },
  { value: 'typescript', label: 'TypeScript', extension: 'ts', tone: 'accent' },
  { value: 'html', label: 'HTML', extension: 'html', tone: 'warning' },
  { value: 'css', label: 'CSS', extension: 'css', tone: 'accent' },
  { value: 'java', label: 'Java', extension: 'java', tone: 'warning' },
  { value: 'c', label: 'C', extension: 'c', tone: 'neutral' },
  { value: 'text', label: '纯文本', extension: 'txt', tone: 'neutral' },
];

export const LANGUAGE_OPTIONS = LANGUAGES.map(({ value, label }) => ({ value, label }));

const LANGUAGE_MAP = new Map<string, LanguageOption>(LANGUAGES.map((item) => [item.value, item]));

export function languageMeta(id: string): LanguageOption {
  return LANGUAGE_MAP.get(id) ?? LANGUAGES[7]!;
}

export function languageName(id: string): string {
  return languageMeta(id).label;
}
