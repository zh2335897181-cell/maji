import { describe, expect, it } from 'vitest';
import {
  countWords,
  createId,
  cutAroundMatch,
  highlightSegments,
  toExcerpt,
  toSafeFileName,
  tokenizeQuery,
} from './text';

describe('文本工具', () => {
  it('中文按字计数，英文与标识符按词计数', () => {
    expect(countWords('函数与参数')).toBe(5);
    // greet(name) 中间没有空格，按一个词计
    expect(countWords('def greet(name)')).toBe(2);
    expect(countWords('用 Python 写一个 add 函数')).toBe(5 + 3);
  });

  it('摘要超长时截断并加省略号', () => {
    const excerpt = toExcerpt('函数可以把一段可重复使用的逻辑组织起来，并通过参数接收外部数据。', 10);
    expect(excerpt).toBe('函数可以把一段可重复…');
    expect(toExcerpt('短句', 10)).toBe('短句');
  });

  it('文件名只保留安全字符', () => {
    expect(toSafeFileName('函数与参数', 'md')).toBe('函数与参数.md');
    expect(toSafeFileName('a/b:c*d?e"f<g>h|i', 'md')).toBe('abcdefghi.md');
    expect(toSafeFileName('   ', 'md')).toBe('未命名笔记.md');
    expect(toSafeFileName('a'.repeat(120), 'md').length).toBeLessThanOrEqual(63);
  });

  it('关键词按空格与中文逗号切分并去重', () => {
    expect(tokenizeQuery('return  Return，print、range')).toEqual(['return', 'print', 'range']);
  });

  it('高亮片段返回结构化数据而不是 HTML', () => {
    const segments = highlightSegments('return 会把结果交还给调用者', ['return']);
    expect(segments[0]).toEqual({ text: 'return', hit: true });
    expect(segments[1]?.hit).toBe(false);
    expect(segments.map((segment) => segment.text).join('')).toBe('return 会把结果交还给调用者');
  });

  it('多个关键词的高亮区间会合并，不会重叠', () => {
    const segments = highlightSegments('abcabc', ['abc']);
    expect(segments.filter((segment) => segment.hit)).toHaveLength(2);
  });

  it('命中位置前后截取上下文并加省略号', () => {
    const text = `${'前'.repeat(60)}关键字${'后'.repeat(60)}`;
    const snippet = cutAroundMatch(text, ['关键字'], 10, 40);
    expect(snippet).toContain('关键字');
    expect(snippet.startsWith('…')).toBe(true);
    expect(snippet.endsWith('…')).toBe(true);
  });

  it('生成的 id 带前缀且互不相同', () => {
    const first = createId('note');
    const second = createId('note');
    expect(first.startsWith('note_')).toBe(true);
    expect(first).not.toBe(second);
  });
});
