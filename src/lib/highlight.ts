/* =============================================================================
   码迹 · 代码高亮（Shiki）
   -----------------------------------------------------------------------------
   只加载产品支持的 7 种语言，控制器单例复用；高亮结果按“语言 + 代码 + 主题”
   缓存，避免每次输入都重新跑一遍高亮。
   ============================================================================= */

import { createHighlighter, type Highlighter } from 'shiki';
import type { LanguageId } from './types';

const SUPPORTED: LanguageId[] = [
  'python',
  'javascript',
  'typescript',
  'html',
  'css',
  'java',
  'c',
  'text',
];

const THEMES = { light: 'github-light', dark: 'github-dark' } as const;

export type HighlightTheme = keyof typeof THEMES;

let highlighterPromise: Promise<Highlighter> | null = null;
const cache = new Map<string, string>();
const MAX_CACHE = 240;

function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: [THEMES.light, THEMES.dark],
      langs: SUPPORTED,
    });
  }
  return highlighterPromise;
}

/** 把别名统一到产品支持的语言 id 上 */
export function normalizeLanguage(value: string): LanguageId {
  const key = value.trim().toLowerCase();
  const aliases: Record<string, LanguageId> = {
    py: 'python',
    python: 'python',
    js: 'javascript',
    javascript: 'javascript',
    jsx: 'javascript',
    ts: 'typescript',
    typescript: 'typescript',
    tsx: 'typescript',
    html: 'html',
    xml: 'html',
    css: 'css',
    scss: 'css',
    java: 'java',
    c: 'c',
    h: 'c',
    text: 'text',
    txt: 'text',
    sh: 'text',
  };
  return aliases[key] ?? 'text';
}

export function isSupportedLanguage(value: string): boolean {
  return normalizeLanguage(value) !== 'text' || value.trim().toLowerCase() === 'text';
}

/**
 * 返回不带外层 pre/code 的 HTML 片段（structure: 'inline'），
 * 由组件的 <pre> 自己控制背景与内边距，保证视觉令牌统一。
 */
export async function highlightCode(
  code: string,
  language: string,
  theme: HighlightTheme = 'light',
): Promise<string> {
  const lang = normalizeLanguage(language);
  const key = `${theme}:${lang}:${code}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  try {
    const highlighter = await getHighlighter();
    const html = highlighter.codeToHtml(code, {
      lang,
      theme: THEMES[theme],
      structure: 'inline',
    });
    if (cache.size > MAX_CACHE) {
      const oldest = cache.keys().next().value;
      if (oldest) cache.delete(oldest);
    }
    cache.set(key, html);
    return html;
  } catch {
    // 高亮失败时退化为纯文本，不能让代码消失
    return escapeHtml(code);
  }
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 预热：打开笔记后后台加载高亮引擎，避免第一次看到代码块时闪一下 */
export function warmUpHighlighter(): void {
  void getHighlighter();
}
