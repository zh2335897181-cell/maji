import { describe, expect, it } from 'vitest';
import { matchDocument, searchDocuments, type SearchDocument } from './search';

function doc(overrides: Partial<SearchDocument> = {}): SearchDocument {
  return {
    id: 'note_func_args',
    title: '函数与参数',
    courseId: 'course_python',
    courseName: 'Python 入门',
    courseColorKey: 'teal',
    language: 'python',
    updatedAt: '2025-03-04T10:00:00.000Z',
    favorite: false,
    tags: ['Python', '函数'],
    contentText: '函数可以把一段可重复使用的逻辑组织起来。return 会把结果交还给调用者。',
    codeText: 'def greet(name):\n    return f"你好，{name}！"',
    ...overrides,
  };
}

const docs: SearchDocument[] = [
  doc(),
  doc({
    id: 'note_box_model',
    title: 'CSS 盒模型',
    courseId: 'course_web',
    courseName: 'Web 前端基础',
    courseColorKey: 'blue',
    language: 'css',
    tags: ['CSS', '布局'],
    contentText: '盒模型由 content、padding、border、margin 四层组成。',
    codeText: '.card { padding: 16px; }',
    favorite: true,
  }),
  doc({
    id: 'note_loops',
    title: '条件判断与循环',
    tags: ['Python', '控制流'],
    contentText: 'range(1, 5) 只会给出 1、2、3、4。',
    codeText: 'for number in range(1, 5): print(number)',
  }),
];

describe('搜索', () => {
  it('标题命中排在正文命中之前', () => {
    const results = searchDocuments(docs, { text: '盒模型' });
    expect(results[0]?.noteId).toBe('note_box_model');
    expect(results[0]?.hitField).toBe('title');
  });

  it('可以搜索到代码块内容并标记为代码命中', () => {
    const results = searchDocuments(docs, { text: 'range' });
    expect(results[0]?.noteId).toBe('note_loops');
    expect(results.some((item) => item.hitField === 'code')).toBe(true);
  });

  it('标签命中会被识别', () => {
    const results = searchDocuments(docs, { text: '布局' });
    expect(results[0]?.hitField).toBe('tag');
  });

  it('多个关键词之间是「与」的关系', () => {
    expect(searchDocuments(docs, { text: '函数 参数' })).toHaveLength(1);
    expect(searchDocuments(docs, { text: '函数 range' })).toHaveLength(0);
  });

  it('按课程、语言、收藏筛选', () => {
    expect(searchDocuments(docs, { text: '', courseId: 'course_web' })).toHaveLength(1);
    expect(searchDocuments(docs, { text: '', language: 'python' })).toHaveLength(2);
    expect(searchDocuments(docs, { text: '', favoriteOnly: true })).toHaveLength(1);
  });

  it('关闭代码检索后不再命中只出现在代码里的内容', () => {
    // 16px 只出现在代码块里，正文中没有
    expect(searchDocuments(docs, { text: '16px', includeCode: false })).toHaveLength(0);
    expect(searchDocuments(docs, { text: '16px', includeCode: true })).toHaveLength(1);
  });

  it('命中片段以关键词为中心，界面再自行高亮', () => {
    const result = matchDocument(docs[0] as SearchDocument, { text: 'return' });
    expect(result?.snippet).toContain('return');
    expect(result?.snippet.length).toBeLessThanOrEqual(100);
  });

  it('limit 会限制结果数量', () => {
    expect(searchDocuments(docs, { text: '', limit: 2 })).toHaveLength(2);
  });

  it('空查询只做筛选，不返回无筛选的全量结果以外的内容', () => {
    expect(searchDocuments(docs, { text: '' })).toHaveLength(3);
  });
});
