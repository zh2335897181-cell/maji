import { describe, expect, it } from 'vitest';
import {
  bulletList,
  buildOutline,
  callout,
  codeBlock,
  doc,
  docToMarkdown,
  docToPlainText,
  extractCodeText,
  heading,
  noteStats,
  paragraph,
  parseInline,
  taskList,
} from './noteDoc';

const sample = doc(
  heading(2, '为什么需要函数'),
  paragraph('函数可以把一段可重复使用的逻辑组织起来。'),
  heading(2, '一个最小的例子'),
  codeBlock('python', 'def greet(name):\n    return f"你好，{name}！"'),
  callout('output', '运行结果', paragraph('你好，小林！')),
  callout('tip', '容易混淆', paragraph('return 会把结果交还给调用者。')),
  taskList([{ text: '写出 add(a, b)' }, { text: '改成 print 试试', checked: true }]),
);

describe('内联语法解析', () => {
  it('解析粗体、行内代码与链接', () => {
    const nodes = parseInline('`name` 是**形参**，见 [文档](https://example.com)');
    expect(nodes).toHaveLength(5);
    expect(nodes[0]).toMatchObject({ text: 'name', marks: [{ type: 'code' }] });
    expect(nodes[1]?.text).toBe(' 是');
    expect(nodes[2]).toMatchObject({ text: '形参', marks: [{ type: 'bold' }] });
    expect(nodes[3]?.text).toBe('，见 ');
    expect(nodes[4]?.marks?.[0]).toEqual({ type: 'link', attrs: { href: 'https://example.com' } });
  });

  it('没有语法糖时返回单个文本节点', () => {
    const nodes = parseInline('普通的一句解释');
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.text).toBe('普通的一句解释');
  });
});

describe('文档读取', () => {
  it('抽取纯文本时保留代码块内容', () => {
    const text = docToPlainText(sample);
    expect(text).toContain('函数可以把一段可重复使用的逻辑组织起来。');
    expect(text).toContain('def greet(name):');
    expect(text).toContain('你好，小林！');
    expect(text).not.toContain('####');
  });

  it('单独抽取代码块文本用于代码搜索', () => {
    expect(extractCodeText(sample)).toContain('return f"你好，{name}！"');
    expect(extractCodeText(sample)).not.toContain('为什么需要函数');
  });

  it('统计字数与代码块数量', () => {
    const stats = noteStats(sample);
    expect(stats.codeBlocks).toBe(1);
    expect(stats.words).toBeGreaterThan(20);
    expect(stats.minutes).toBeGreaterThanOrEqual(1);
  });
});

describe('大纲', () => {
  it('标题、代码块与语义块都会成为大纲项', () => {
    const outline = buildOutline(sample);
    expect(outline.map((item) => item.kind)).toEqual([
      'heading',
      'heading',
      'code',
      'output',
      'callout',
    ]);
    expect(outline[0]?.text).toBe('为什么需要函数');
    expect(outline[0]?.level).toBe(2);
    expect(outline[2]?.text).toBe('Python 代码');
    expect(outline[3]?.text).toBe('运行结果');
  });

  it('位置与 ProseMirror 的位置算法一致（手工推算）', () => {
    // heading(1 + 文本' A' +1 = 3) → paragraph(1 + 'x' + 1 = 3) → codeBlock 起始位置 = 6
    const simple = doc(heading(2, 'A'), paragraph('x'), codeBlock('python', 'y'));
    expect(buildOutline(simple).map((item) => item.pos)).toEqual([0, 6]);
  });

  it('位置递增', () => {
    const positions = buildOutline(sample).map((item) => item.pos);
    expect(positions[0]).toBe(0);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('空文档没有大纲项', () => {
    expect(buildOutline(doc(paragraph('')))).toEqual([]);
  });
});

describe('Markdown 导出', () => {
  it('保留标题层级、代码块语言与待办状态', () => {
    const markdown = docToMarkdown(sample);
    expect(markdown).toContain('## 为什么需要函数');
    expect(markdown).toContain('```python');
    expect(markdown).toContain('def greet(name):');
    expect(markdown).toContain('- [ ] 写出 add(a, b)');
    expect(markdown).toContain('- [x] 改成 print 试试');
    expect(markdown).toContain('**运行结果**');
  });

  it('列表导出为 Markdown 列表项', () => {
    const markdown = docToMarkdown(doc(bulletList(['形参', '实参'])));
    expect(markdown).toContain('- 形参');
    expect(markdown).toContain('- 实参');
  });
});
