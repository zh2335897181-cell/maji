/* =============================================================================
   码迹 · 编辑器扩展
   -----------------------------------------------------------------------------
   在 StarterKit 的基础上补两个与“编程笔记”强相关的节点：
     · codeBlock —— 带语言属性、支持 ```python 快捷输入、用 Shiki 高亮渲染
     · callout   —— 说明 / 容易混淆 / 常见报错 / 运行结果 四种语义块
   ============================================================================= */

import { InputRule, Node, mergeAttributes, textblockTypeInputRule } from '@tiptap/core';
import { CodeBlock } from '@tiptap/extension-code-block';
import { Image } from '@tiptap/extension-image';
import { Placeholder } from '@tiptap/extension-placeholder';
import { TaskItem } from '@tiptap/extension-task-item';
import { TaskList } from '@tiptap/extension-task-list';
import { ReactNodeViewRenderer } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { normalizeLanguage } from '../../../lib/highlight';
import type { CalloutVariant } from '../../../lib/noteDoc';
import { CalloutView } from './CalloutView';
import { CodeBlockView } from './CodeBlockView';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    callout: {
      /** 把当前块包成一个语义块 */
      setCallout: (attributes?: { variant?: CalloutVariant; label?: string }) => ReturnType;
      toggleCallout: (attributes?: { variant?: CalloutVariant; label?: string }) => ReturnType;
      unsetCallout: () => ReturnType;
    };
  }
}

export const CodeBlockEnhanced = CodeBlock.extend({
  addInputRules() {
    return [
      ...(this.parent?.() ?? []),
      // ```python + 空格 → 直接插入带语言的代码块
      textblockTypeInputRule({
        find: /^```([a-zA-Z+#]+)\s$/,
        type: this.type,
        getAttributes: (match) => ({ language: normalizeLanguage(String(match[1] ?? '')) }),
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView);
  },
});

export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,
  selectable: true,

  addAttributes() {
    return {
      variant: {
        default: 'note',
        parseHTML: (element) => element.getAttribute('data-variant') ?? 'note',
        renderHTML: (attributes) => ({ 'data-variant': String(attributes['variant'] ?? 'note') }),
      },
      label: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-label') ?? '',
        renderHTML: (attributes) => ({ 'data-label': String(attributes['label'] ?? '') }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-callout]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-callout': '' }), 0];
  },

  addCommands() {
    return {
      setCallout:
        (attributes) =>
        ({ commands }) =>
          commands.wrapIn(this.name, attributes),
      toggleCallout:
        (attributes) =>
        ({ commands }) =>
          commands.toggleWrap(this.name, attributes),
      unsetCallout:
        () =>
        ({ commands }) =>
          commands.lift(this.name),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(CalloutView);
  },

  addInputRules() {
    return [
      // 输入 :::tip + 空格 也能插入语义块
      new InputRule({
        find: /^:::(note|tip|warning|output)\s$/,
        handler: ({ state, range, match }) => {
          const variant = (match[1] ?? 'note') as CalloutVariant;
          const node = this.type.create({ variant, label: '' });
          state.tr.replaceRangeWith(range.from, range.to, node);
        },
      }),
    ];
  },

  addKeyboardShortcuts() {
    return {
      // 空语义块里按回车直接退出，避免被困住
      Enter: () => {
        const { empty, $from } = this.editor.state.selection;
        if (!empty) return false;
        if ($from.parent.content.size !== 0) return false;
        if ($from.node(-1).type.name !== this.name) return false;
        return this.editor.commands.unsetCallout();
      },
    };
  },
});

/**
 * 编辑器扩展清单。放在一个函数里，方便测试与替换。
 * 关闭 StarterKit 自带的 codeBlock，改用带语言属性 + Shiki 高亮的版本。
 */
export function buildEditorExtensions() {
  return [
    StarterKit.configure({
      codeBlock: false,
      heading: { levels: [1, 2, 3] },
      link: {
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      },
    }),
    CodeBlockEnhanced.configure({
      defaultLanguage: 'text',
      languageClassPrefix: 'language-',
      enableTabIndentation: true,
      tabSize: 4,
    }),
    Callout,
    TaskList,
    TaskItem.configure({ nested: true }),
    Image.configure({ inline: false, allowBase64: true }),
    Placeholder.configure({
      placeholder: '继续记录… 输入 # 加空格插入小标题，输入 ```python 插入代码块',
      showOnlyWhenEditable: true,
    }),
  ];
}
