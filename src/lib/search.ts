/* =============================================================================
   码迹 · 搜索（纯函数）
   -----------------------------------------------------------------------------
   同一套打分逻辑被两处使用：
     · 浏览器示例数据仓库（localRepository）
     · Electron 主进程（先用 SQL 粗筛，再用本函数精确排序）
   这样“同一个关键词在两种数据源下得到同一批结果”。
   ============================================================================= */

import type { CourseColorKey, LanguageId, SearchQuery, SearchResult } from './types';
import { cutAroundMatch, tokenizeQuery } from './text';

export interface SearchDocument {
  id: string;
  title: string;
  courseId: string;
  courseName: string;
  courseColorKey: CourseColorKey;
  language: LanguageId;
  updatedAt: string;
  favorite: boolean;
  tags: string[];
  /** 正文纯文本（不含代码块） */
  contentText: string;
  /** 代码块纯文本 */
  codeText: string;
}

export type HitField = 'title' | 'tag' | 'code' | 'body';

const FIELD_WEIGHT: Record<HitField, number> = { title: 6, tag: 4, code: 3, body: 1 };

interface FieldMatch {
  field: HitField;
  weight: number;
}

function matchFields(doc: SearchDocument, token: string, includeCode: boolean): FieldMatch[] {
  const matches: FieldMatch[] = [];
  if (doc.title.toLowerCase().includes(token)) matches.push({ field: 'title', weight: FIELD_WEIGHT.title });
  if (doc.tags.some((tag) => tag.toLowerCase().includes(token))) {
    matches.push({ field: 'tag', weight: FIELD_WEIGHT.tag });
  }
  if (includeCode && doc.codeText.toLowerCase().includes(token)) {
    matches.push({ field: 'code', weight: FIELD_WEIGHT.code });
  }
  if (doc.contentText.toLowerCase().includes(token)) {
    matches.push({ field: 'body', weight: FIELD_WEIGHT.body });
  }
  return matches;
}

function snippetSource(doc: SearchDocument, field: HitField): string {
  if (field === 'title') return doc.title;
  if (field === 'tag') return doc.tags.map((tag) => `#${tag}`).join(' ');
  if (field === 'code') return doc.codeText;
  return doc.contentText;
}

/**
 * 对单个文档求匹配结果；不匹配返回 null。
 * 多个关键词之间是“与”的关系，全部命中才算匹配。
 */
export function matchDocument(
  doc: SearchDocument,
  query: SearchQuery,
  keywords: string[] = tokenizeQuery(query.text),
): SearchResult | null {
  if (query.courseId && doc.courseId !== query.courseId) return null;
  if (query.language && doc.language !== query.language) return null;
  if (query.favoriteOnly && !doc.favorite) return null;

  const includeCode = query.includeCode !== false;
  let score = 0;
  let bestField: HitField | null = null;

  for (const keyword of keywords) {
    const matches = matchFields(doc, keyword, includeCode);
    if (matches.length === 0) return null;
    for (const match of matches) {
      score += match.weight;
      if (!bestField || match.weight > FIELD_WEIGHT[bestField]) bestField = match.field;
    }
  }

  // 没有任何关键词时（纯筛选），以标题作为片段
  const field: HitField = bestField ?? 'title';
  const snippet = cutAroundMatch(snippetSource(doc, field), keywords);

  return {
    noteId: doc.id,
    title: doc.title,
    courseId: doc.courseId,
    courseName: doc.courseName,
    courseColorKey: doc.courseColorKey,
    language: doc.language,
    updatedAt: doc.updatedAt,
    favorite: doc.favorite,
    tags: doc.tags,
    hitField: field,
    snippet,
    score,
  };
}

/** 结果排序：先按相关度，再按更新时间 */
export function searchDocuments(
  docs: SearchDocument[],
  query: SearchQuery,
  now: number = Date.now(),
): SearchResult[] {
  const keywords = tokenizeQuery(query.text);
  const results: SearchResult[] = [];

  for (const doc of docs) {
    const result = matchDocument(doc, query, keywords);
    if (result) results.push(result);
  }

  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const recency = (result: SearchResult): number => {
      const age = now - new Date(result.updatedAt).getTime();
      return age < 7 * 24 * 60 * 60 * 1000 ? 1 : 0;
    };
    if (recency(a) !== recency(b)) return recency(b) - recency(a);
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  return typeof query.limit === 'number' ? results.slice(0, query.limit) : results;
}

export const HIT_FIELD_LABEL: Record<HitField, string> = {
  title: '标题命中',
  tag: '标签命中',
  code: '代码命中',
  body: '正文命中',
};
