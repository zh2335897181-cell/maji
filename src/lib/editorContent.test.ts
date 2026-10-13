import { expect, it } from 'vitest';
import { generateJSON } from '@tiptap/core';
import { buildContentExtensions } from './editorContent';
it.each(['', 'invalid', '-1', '1.5'])('uses a valid default for pasted ordered-list start %s', start => {
  const doc=generateJSON(`<ol start="${start}"><li>保留文本</li></ol>`,buildContentExtensions());
  expect(doc.content?.[0]?.attrs?.start).toBe(1);
});
it('preserves a valid custom ordered-list start',()=>{
  const doc=generateJSON('<ol start="5"><li>第五项</li></ol>',buildContentExtensions());
  expect(doc.content?.[0]?.attrs?.start).toBe(5);
});
