import { Editor, type JSONContent } from '@tiptap/core';
import { describe, expect, it } from 'vitest';
import { buildEditorExtensions } from './extensions';

describe('笔记编辑器的表格与高亮内容', () => {
  it('插入表格后保存表头和单元格结构', () => {
    const editor = new Editor({
      element: document.createElement('div'),
      extensions: buildEditorExtensions(),
      content: '<p>对比知识点</p>',
    });

    editor.commands.insertTable({ rows: 2, cols: 2, withHeaderRow: true });

    const table = editor.getJSON().content?.find((node) => node.type === 'table') as JSONContent | undefined;
    expect(table?.content).toHaveLength(2);
    expect(table?.content?.[0]?.content?.[0]?.type).toBe('tableHeader');
    expect(table?.content?.[1]?.content?.[1]?.type).toBe('tableCell');
    editor.destroy();
  });

  it('高亮标记包含颜色并能随 JSON 内容重新载入', () => {
    const editor = new Editor({
      element: document.createElement('div'),
      extensions: buildEditorExtensions(),
      content: '<p>容易出错的边界条件</p>',
    });
    editor.commands.setTextSelection({ from: 1, to: 10 });
    editor.commands.setHighlight({ color: '#fff3a3' });
    const saved = editor.getJSON();

    const reopened = new Editor({
      element: document.createElement('div'),
      extensions: buildEditorExtensions(),
      content: saved,
    });

    expect(reopened.getJSON().content?.[0]?.content?.[0]?.marks).toContainEqual({
      type: 'highlight',
      attrs: { color: '#fff3a3' },
    });
    editor.destroy();
    reopened.destroy();
  });

  it('Ctrl+Alt+T 在编辑光标处插入带表头的表格', () => {
    const editor = new Editor({
      element: document.createElement('div'),
      extensions: buildEditorExtensions(),
      content: '<p>比较两种算法</p>',
    });
    editor.commands.setTextSelection(4);
    editor.view.dom.dispatchEvent(
      new KeyboardEvent('keydown', { key: 't', ctrlKey: true, altKey: true, bubbles: true }),
    );

    expect(editor.getJSON().content?.some((node) => node.type === 'table')).toBe(true);
    editor.destroy();
  });

  it('Ctrl+Shift+H 高亮当前选中文字', () => {
    const editor = new Editor({
      element: document.createElement('div'),
      extensions: buildEditorExtensions(),
      content: '<p>重点内容</p>',
    });
    editor.commands.setTextSelection({ from: 1, to: 5 });
    editor.view.dom.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'H', ctrlKey: true, shiftKey: true, bubbles: true }),
    );

    expect(editor.getJSON().content?.[0]?.content?.[0]?.marks).toContainEqual({
      type: 'highlight',
      attrs: { color: '#fff3a3' },
    });
    editor.destroy();
  });
});
