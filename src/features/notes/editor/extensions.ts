/* =============================================================================
   码迹 · 编辑器扩展
   -----------------------------------------------------------------------------
   在 StarterKit 的基础上补两个与“编程笔记”强相关的节点：
     · codeBlock —— 带语言属性、支持 ```python 快捷输入、用 Shiki 高亮渲染
     · callout   —— 说明 / 容易混淆 / 常见报错 / 运行结果 四种语义块
   ============================================================================= */

import { Extension, InputRule, textblockTypeInputRule } from '@tiptap/core';
import { CodeBlock } from '@tiptap/extension-code-block';
import { Placeholder } from '@tiptap/extension-placeholder';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { buildContentExtensions, CalloutContent } from '../../../lib/editorContent';
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

export const Callout = CalloutContent.extend({
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

/** 常用编辑操作的自定义快捷键；Mod 在 Windows/Linux 上对应 Ctrl。 */
const EditorShortcuts = Extension.create({
  name: 'majiEditorShortcuts',

  addKeyboardShortcuts() {
    return {
      'Mod-Shift-1': () => this.editor.commands.toggleHeading({ level: 1 }),
      'Mod-Shift-2': () => this.editor.commands.toggleHeading({ level: 2 }),
      'Mod-Shift-3': () => this.editor.commands.toggleHeading({ level: 3 }),
      'Mod-Shift-H': () => this.editor.commands.toggleHighlight({ color: '#fff3a3' }),
      'Mod-Alt-t': () =>
        this.editor.commands.insertTable({ rows: 3, cols: 3, withHeaderRow: true }),
    };
  },
});

/**
 * 编辑器扩展清单。放在一个函数里，方便测试与替换。
 * 关闭 StarterKit 自带的 codeBlock，改用带语言属性 + Shiki 高亮的版本。
 */
export function buildEditorExtensions() {
  return [
    ...buildContentExtensions(CodeBlockEnhanced, Callout),
    EditorShortcuts,
    Placeholder.configure({
      placeholder: '继续记录… 输入 # 加空格插入小标题，输入 ```python 插入代码块',
      showOnlyWhenEditable: true,
    }),
  ];
}
