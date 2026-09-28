/* =============================================================================
   大纲位置校验（与 ProseMirror 对齐）
   -----------------------------------------------------------------------------
   buildOutline 自己实现了一套位置推算，用来在“没有编辑器实例”的场景（导出、
   预览、测试）生成大纲。这里用真正的 ProseMirror schema 做一次交叉验证，
   确保点击大纲能跳到正确的位置。
   ============================================================================= */

import { getSchema } from '@tiptap/core';
import { Node as PMNode } from '@tiptap/pm/model';
import { describe, expect, it } from 'vitest';
import { buildOutline, callout, codeBlock, doc, heading, paragraph, taskList } from '../../../lib/noteDoc';
import { buildEditorExtensions } from './extensions';

const sample = doc(
  heading(2, '为什么需要函数'),
  paragraph('函数可以把一段可重复使用的逻辑组织起来。'),
  heading(2, '一个最小的例子'),
  codeBlock('python', 'def greet(name):\n    return f"你好，{name}！"'),
  callout('output', '运行结果', paragraph('你好，小林！')),
  callout('tip', '容易混淆', paragraph('return 会把结果交还给调用者。')),
  taskList([{ text: '写出 add(a, b)' }, { text: '改成 print 试试', checked: true }]),
);

describe('大纲位置与 ProseMirror 一致', () => {
  const schema = getSchema(buildEditorExtensions());
  const pmDoc = PMNode.fromJSON(schema, sample);

  it('每个大纲项的 pos 都指向对应的 ProseMirror 节点', () => {
    const expected: Array<{ pos: number; type: string }> = [];
    pmDoc.descendants((node, pos) => {
      if (['heading', 'codeBlock', 'callout'].includes(node.type.name)) {
        expected.push({ pos, type: node.type.name });
      }
      return true;
    });

    const outline = buildOutline(sample);
    expect(outline.map((item) => item.pos)).toEqual(expected.map((item) => item.pos));
    expect(outline).toHaveLength(expected.length);
  });

  it('pos 处确实存在可滚动到的节点', () => {
    for (const item of buildOutline(sample)) {
      const node = pmDoc.nodeAt(item.pos);
      expect(node).not.toBeNull();
    }
  });

  it('代码块的语言属性进入大纲标题', () => {
    const codeItem = buildOutline(sample).find((item) => item.kind === 'code');
    expect(codeItem?.text).toBe('Python 代码');
  });
});
