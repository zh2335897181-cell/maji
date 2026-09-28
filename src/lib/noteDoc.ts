/* =============================================================================
   码迹 · 笔记文档模型（纯函数）
   -----------------------------------------------------------------------------
   笔记正文使用 TipTap 的文档 JSON。这里刻意不依赖 @tiptap/*，原因有三：
     1. 纯函数可以脱离编辑器直接单测
     2. 主进程 / 脚本 / 导出流程都能复用
     3. 界面与编辑器实现解耦，换编辑器不影响数据格式
   ============================================================================= */

import type { LanguageId, NoteStats, OutlineItem, OutlineKind } from './types';
import { countWords, estimateMinutes, toExcerpt } from './text';

export interface DocMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface DocNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: DocNode[];
  marks?: DocMark[];
  text?: string;
}

export interface Doc {
  type: 'doc';
  content: DocNode[];
}

export type CalloutVariant = 'note' | 'tip' | 'warning' | 'output';

export interface CalloutMeta {
  variant: CalloutVariant;
  /** 默认标题 */
  label: string;
  /** 工具栏上的动作名 */
  action: string;
}

export const CALLOUT_VARIANTS: Record<CalloutVariant, CalloutMeta> = {
  note: { variant: 'note', label: '说明', action: '说明块' },
  tip: { variant: 'tip', label: '容易混淆', action: '提示块' },
  warning: { variant: 'warning', label: '常见报错', action: '报错块' },
  output: { variant: 'output', label: '运行结果', action: '输出结果' },
};

/* ------------------------------------------------------------------ 构造器 */

export function doc(...content: DocNode[]): Doc {
  return { type: 'doc', content };
}

export function emptyDoc(): Doc {
  return { type: 'doc', content: [{ type: 'paragraph' }] };
}

/** 把编辑器或数据库里取出的未知结构收敛成 Doc，避免在组件里到处做断言 */
export function asDoc(value: unknown): Doc {
  if (value && typeof value === 'object' && (value as DocNode).type === 'doc') {
    const node = value as DocNode;
    return { type: 'doc', content: node.content ?? [] };
  }
  return emptyDoc();
}

export function text(value: string, marks?: DocMark[]): DocNode {
  const node: DocNode = { type: 'text', text: value };
  if (marks && marks.length > 0) node.marks = marks;
  return node;
}

/**
 * 极简内联语法：`**粗体**`、`` `行内代码` ``、`[文字](链接)`。
 * 只支持这三种，足够写技术笔记，也不会让用户觉得语法复杂。
 */
export function parseInline(value: string): DocNode[] {
  const nodes: DocNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let cursor = 0;
  let match = pattern.exec(value);

  while (match) {
    if (match.index > cursor) nodes.push(text(value.slice(cursor, match.index)));
    const token = match[0];
    if (token.startsWith('**')) {
      nodes.push(text(token.slice(2, -2), [{ type: 'bold' }]));
    } else if (token.startsWith('`')) {
      nodes.push(text(token.slice(1, -1), [{ type: 'code' }]));
    } else {
      const link = /\[([^\]]+)\]\(([^)]+)\)/.exec(token);
      if (link && link[1] && link[2]) {
        nodes.push(text(link[1], [{ type: 'link', attrs: { href: link[2] } }]));
      } else {
        nodes.push(text(token));
      }
    }
    cursor = match.index + token.length;
    match = pattern.exec(value);
  }

  if (cursor < value.length) nodes.push(text(value.slice(cursor)));
  return nodes.length > 0 ? nodes : [text('')];
}

export function paragraph(value: string): DocNode {
  if (value.length === 0) return { type: 'paragraph' };
  return { type: 'paragraph', content: parseInline(value) };
}

export function heading(level: 1 | 2 | 3, value: string): DocNode {
  return { type: 'heading', attrs: { level }, content: parseInline(value) };
}

export function codeBlock(language: LanguageId, code: string): DocNode {
  return {
    type: 'codeBlock',
    attrs: { language },
    content: code.length > 0 ? [{ type: 'text', text: code }] : [],
  };
}

export function callout(variant: CalloutVariant, label: string, ...content: DocNode[]): DocNode {
  return { type: 'callout', attrs: { variant, label }, content };
}

/** 运行结果 / 输出展示块，视觉上与代码块区分为“终端输出” */
export function outputBlock(output: string, label = CALLOUT_VARIANTS.output.label): DocNode {
  return callout('output', label, codeBlock('text', output));
}

export function bulletList(items: string[]): DocNode {
  return {
    type: 'bulletList',
    content: items.map((item) => ({ type: 'listItem', content: [paragraph(item)] })),
  };
}

export function orderedList(items: string[]): DocNode {
  return {
    type: 'orderedList',
    attrs: { start: 1 },
    content: items.map((item) => ({ type: 'listItem', content: [paragraph(item)] })),
  };
}

export function taskList(items: Array<{ text: string; checked?: boolean }>): DocNode {
  return {
    type: 'taskList',
    content: items.map((item) => ({
      type: 'taskItem',
      attrs: { checked: item.checked ?? false },
      content: [paragraph(item.text)],
    })),
  };
}

export function blockquote(value: string): DocNode {
  return { type: 'blockquote', content: [paragraph(value)] };
}

export function horizontalRule(): DocNode {
  return { type: 'horizontalRule' };
}

export function image(src: string, alt = ''): DocNode {
  return { type: 'image', attrs: { src, alt } };
}

/* --------------------------------------------------------------- 读取与统计 */

const BLOCK_TYPES = new Set([
  'paragraph',
  'heading',
  'codeBlock',
  'blockquote',
  'listItem',
  'taskItem',
  'callout',
  'tableRow',
]);

/** 抽取纯文本：代码块用换行包裹，段落之间用换行分隔 */
export function extractText(node: DocNode): string {
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'hardBreak') return '\n';
  if (node.type === 'codeBlock') {
    const code = (node.content ?? []).map((child) => child.text ?? '').join('');
    return `${code}\n`;
  }
  if (node.type === 'horizontalRule' || node.type === 'image') return '\n';

  const inner = (node.content ?? []).map(extractText).join('');
  return BLOCK_TYPES.has(node.type) ? `${inner}\n` : inner;
}

export function docToPlainText(value: Doc): string {
  return extractText(value as DocNode)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** 只取代码块内容，供“搜索代码”使用 */
export function extractCodeText(node: DocNode): string {
  if (node.type === 'codeBlock') {
    return `${(node.content ?? []).map((child) => child.text ?? '').join('')}\n`;
  }
  return (node.content ?? []).map(extractCodeText).join('');
}

function nodeSize(node: DocNode): number {
  if (node.type === 'text') return (node.text ?? '').length;
  if (node.type === 'hardBreak' || node.type === 'horizontalRule' || node.type === 'image') return 1;
  const contentSize = (node.content ?? []).reduce((sum, child) => sum + nodeSize(child), 0);
  return contentSize + 2;
}

function inlineText(node: DocNode): string {
  if (node.type === 'text') return node.text ?? '';
  return (node.content ?? []).map(inlineText).join('');
}

/**
 * 生成右侧大纲：标题 + 代码块 + 提示块 + 输出结果。
 * pos 直接使用 ProseMirror 的文档位置，点击即可跳转。
 */
export function buildOutline(value: Doc): OutlineItem[] {
  const items: OutlineItem[] = [];
  let counter = 0;

  const visit = (node: DocNode, pos: number): void => {
    const kind = outlineKind(node);
    if (kind) {
      counter += 1;
      items.push({
        id: `${kind}-${counter}`,
        kind,
        level: node.type === 'heading' ? headingLevel(node) : 3,
        text: outlineLabel(node, kind),
        pos,
      });
      return; // 标题内部不再递归，避免把标题里的文本再当成大纲项
    }
    let childPos = pos + 1;
    for (const child of node.content ?? []) {
      visit(child, childPos);
      childPos += nodeSize(child);
    }
  };

  let childPos = 0;
  for (const child of (value as DocNode).content ?? []) {
    visit(child, childPos);
    childPos += nodeSize(child);
  }
  return items;
}

function headingLevel(node: DocNode): 1 | 2 | 3 {
  const level = Number(node.attrs?.['level'] ?? 1);
  if (level <= 1) return 1;
  if (level === 2) return 2;
  return 3;
}

function outlineKind(node: DocNode): OutlineKind | null {
  if (node.type === 'heading' && headingLevel(node) <= 3) return 'heading';
  if (node.type === 'codeBlock') return 'code';
  if (node.type === 'callout') {
    return node.attrs?.['variant'] === 'output' ? 'output' : 'callout';
  }
  return null;
}

function outlineLabel(node: DocNode, kind: OutlineKind): string {
  if (kind === 'heading') return inlineText(node);
  if (kind === 'code') {
    const language = String(node.attrs?.['language'] ?? 'text');
    return `${languageLabel(language)} 代码`;
  }
  const label = String(node.attrs?.['label'] ?? '');
  return label.length > 0 ? label : kind === 'output' ? '运行结果' : '说明';
}

export function languageLabel(language: string): string {  const map: Record<string, string> = {
    python: 'Python',
    javascript: 'JavaScript',
    typescript: 'TypeScript',
    html: 'HTML',
    css: 'CSS',
    java: 'Java',
    c: 'C',
    text: '纯文本',
  };
  return map[language] ?? language;
}

export function noteStats(value: Doc): NoteStats {
  const codeText = extractCodeText(value as DocNode);
  const plain = docToPlainText(value).replace(codeText, ' ');
  let codeBlocks = 0;
  const walk = (node: DocNode): void => {
    if (node.type === 'codeBlock') codeBlocks += 1;
    (node.content ?? []).forEach(walk);
  };
  walk(value as DocNode);

  const words = countWords(plain);
  return { words, codeBlocks, minutes: estimateMinutes(words) };
}

/**
 * 列表摘要取第一段正文，跳过标题与代码块。
 * 否则摘要会被代码占满，列表读起来全是符号。
 */
export function firstParagraphText(value: Doc): string {
  let found = '';
  const visit = (node: DocNode): boolean => {
    if (node.type === 'paragraph') {
      const text = inlineText(node).trim();
      if (text.length > 0) {
        found = text;
        return true;
      }
      return false;
    }
    if (node.type === 'heading' || node.type === 'codeBlock') return false;
    for (const child of node.content ?? []) {
      if (visit(child)) return true;
    }
    return false;
  };

  for (const node of (value as DocNode).content ?? []) {
    if (visit(node)) break;
  }
  return found;
}

/**
 * 生成列表摘要。浏览器实现与主进程实现都调用这里，
 * 保证同一条笔记在两种数据源下摘要完全一致。
 */
export function noteExcerpt(value: Doc, plainText?: string): string {
  const paragraph = firstParagraphText(value);
  if (paragraph.length > 0) return toExcerpt(paragraph);
  return toExcerpt(plainText ?? docToPlainText(value));
}

/* --------------------------------------------------------------- Markdown 导出 */

function marksToMarkdown(node: DocNode, value: string): string {
  let result = value;
  for (const mark of node.marks ?? []) {
    if (mark.type === 'bold') result = `**${result}**`;
    if (mark.type === 'italic') result = `*${result}*`;
    if (mark.type === 'code') result = `\`${result}\``;
    if (mark.type === 'link') result = `[${result}](${String(mark.attrs?.['href'] ?? '')})`;
  }
  return result;
}

function inlineToMarkdown(node: DocNode): string {
  if (node.type === 'text') return marksToMarkdown(node, node.text ?? '');
  if (node.type === 'hardBreak') return '  \n';
  return (node.content ?? []).map(inlineToMarkdown).join('');
}

/** 导出为 Markdown，供“导出笔记”使用；代码块保留语言标记 */
export function docToMarkdown(value: Doc): string {
  const lines: string[] = [];

  const write = (node: DocNode, indent = ''): void => {
    switch (node.type) {
      case 'heading': {
        const level = headingLevel(node);
        lines.push(`${'#'.repeat(level)} ${inlineToMarkdown(node)}`, '');
        return;
      }
      case 'paragraph': {
        lines.push(`${indent}${inlineToMarkdown(node)}`, '');
        return;
      }
      case 'codeBlock': {
        const language = String(node.attrs?.['language'] ?? '');
        const code = (node.content ?? []).map((child) => child.text ?? '').join('');
        lines.push(`\`\`\`${language === 'text' ? '' : language}`, code, '```', '');
        return;
      }
      case 'callout': {
        const label = String(node.attrs?.['label'] ?? '');
        const isOutput = node.attrs?.['variant'] === 'output';
        if (label) lines.push(isOutput ? `**${label}**` : `> **${label}**`);
        for (const child of node.content ?? []) write(child, isOutput ? '' : '> ');
        return;
      }
      case 'bulletList':
      case 'taskList': {
        for (const item of node.content ?? []) {
          const checked = node.type === 'taskList' ? Boolean(item.attrs?.['checked']) : false;
          const marker = node.type === 'taskList' ? `- [${checked ? 'x' : ' '}]` : '-';
          const text = inlineToMarkdown((item.content ?? [])[0] ?? { type: 'paragraph' });
          lines.push(`${indent}${marker} ${text}`);
        }
        lines.push('');
        return;
      }
      case 'orderedList': {
        let index = 1;
        for (const item of node.content ?? []) {
          const text = inlineToMarkdown((item.content ?? [])[0] ?? { type: 'paragraph' });
          lines.push(`${indent}${index}. ${text}`);
          index += 1;
        }
        lines.push('');
        return;
      }
      case 'blockquote': {
        const text = (node.content ?? []).map(inlineToMarkdown).join('\n');
        lines.push(
          text
            .split('\n')
            .map((line) => `> ${line}`)
            .join('\n'),
          '',
        );
        return;
      }
      case 'horizontalRule': {
        lines.push('---', '');
        return;
      }
      case 'image': {
        lines.push(`![${String(node.attrs?.['alt'] ?? '')}](${String(node.attrs?.['src'] ?? '')})`, '');
        return;
      }
      default: {
        for (const child of node.content ?? []) write(child, indent);
      }
    }
  };

  for (const node of (value as DocNode).content ?? []) write(node);
  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}

/** 新建空笔记时给一点提示，避免打开就是一片空白 */
export function starterDoc(title: string): Doc {
  return doc(heading(1, title), paragraph(''), paragraph('在这里开始记录。输入 `#` 加空格可以输入小标题，输入 ``` 可以插入代码块。'));
}

/** 从代码片段新建笔记时使用 */
export function snippetToDoc(title: string, language: LanguageId, code: string, description: string): Doc {
  return doc(
    heading(1, title),
    paragraph(description || '记录这段代码在做什么。'),
    codeBlock(language, code),
  );
}
