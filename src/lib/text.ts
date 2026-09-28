/* =============================================================================
   码迹 · 文本工具（纯函数，渲染进程与主进程共用）
   ============================================================================= */

/** 生成带前缀的短 id；优先使用 crypto.randomUUID */
export function createId(prefix: string): string {
  const globalCrypto = globalThis.crypto;
  if (globalCrypto && typeof globalCrypto.randomUUID === 'function') {
    return `${prefix}_${globalCrypto.randomUUID().slice(0, 8)}`;
  }
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}${random}`;
}

/** 中文标题不适合做文件名，这里只保留可安全跨平台使用的字符 */
export function toSafeFileName(title: string, extension: string): string {
  const base = title
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
  return `${base || '未命名笔记'}.${extension}`;
}

/** 把正文压成列表里显示的一句话摘要 */
export function toExcerpt(text: string, maxLength = 76): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength)}…`;
}

/** 去掉 Markdown 语法糖，用于纯文本展示 */
export function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*([^*]*)\*\*/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .trim();
}

/** 中文字符按字计数，英文按词计数，用于“约 X 字” */
export function countWords(text: string): number {
  const cjk = text.match(/[\u3400-\u9fff\uf900-\ufaff]/g)?.length ?? 0;
  const latin = text
    .replace(/[\u3400-\u9fff\uf900-\ufaff]/g, ' ')
    .split(/\s+/)
    .filter((word) => /[A-Za-z0-9_]/.test(word)).length;
  return cjk + latin;
}

/** 估算阅读时间（中文阅读速度约 300 字/分钟） */
export function estimateMinutes(words: number): number {
  return Math.max(1, Math.round(words / 300));
}

/** 把查询串切成关键词：空格分隔，忽略大小写，去掉过短的噪声词 */
export function tokenizeQuery(query: string): string[] {
  return Array.from(
    new Set(
      query
        .toLowerCase()
        .split(/[\s,，、]+/)
        .map((token) => token.trim())
        .filter((token) => token.length > 0),
    ),
  );
}

export interface SnippetSegment {
  text: string;
  hit: boolean;
}

/**
 * 把命中关键词的片段切成带标记的段落，界面用 <mark> 渲染。
 * 返回结构化数据而不是 HTML 字符串，避免拼接 HTML 带来的注入风险。
 */
export function highlightSegments(text: string, keywords: string[]): SnippetSegment[] {
  const plain = text.replace(/\s+/g, ' ').trim();
  if (keywords.length === 0) return [{ text: plain, hit: false }];

  const lower = plain.toLowerCase();
  const ranges: Array<{ start: number; end: number }> = [];

  for (const keyword of keywords) {
    if (!keyword) continue;
    let index = lower.indexOf(keyword);
    while (index !== -1) {
      ranges.push({ start: index, end: index + keyword.length });
      index = lower.indexOf(keyword, index + keyword.length);
    }
  }

  if (ranges.length === 0) return [{ text: plain, hit: false }];

  ranges.sort((a, b) => a.start - b.start);
  const merged: Array<{ start: number; end: number }> = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    // 仅合并真正重叠的区间；相邻但不重叠的关键词各自高亮
    if (last && range.start < last.end) {
      last.end = Math.max(last.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }

  const segments: SnippetSegment[] = [];
  let cursor = 0;
  for (const range of merged) {
    if (range.start > cursor) segments.push({ text: plain.slice(cursor, range.start), hit: false });
    segments.push({ text: plain.slice(range.start, range.end), hit: true });
    cursor = range.end;
  }
  if (cursor < plain.length) segments.push({ text: plain.slice(cursor), hit: false });
  return segments;
}

/** 以第一个命中位置为中心截取上下文，保证结果行里能看到关键词 */
export function cutAroundMatch(text: string, keywords: string[], radius = 28, maxLength = 96): string {
  const plain = text.replace(/\s+/g, ' ').trim();
  if (keywords.length === 0) return plain.slice(0, maxLength);

  const lower = plain.toLowerCase();
  let hitIndex = -1;
  for (const keyword of keywords) {
    const index = lower.indexOf(keyword);
    if (index !== -1 && (hitIndex === -1 || index < hitIndex)) hitIndex = index;
  }
  if (hitIndex === -1) return plain.slice(0, maxLength);

  const start = Math.max(0, hitIndex - radius);
  const end = Math.min(plain.length, start + maxLength);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < plain.length ? '…' : '';
  return `${prefix}${plain.slice(start, end)}${suffix}`;
}

/** 占位符替换：把“第 {n} 天”这类模板变成真实文案 */
export function interpolate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    key in values ? String(values[key]) : `{${key}}`,
  );
}
