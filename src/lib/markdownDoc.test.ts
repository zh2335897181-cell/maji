import {expect,it} from 'vitest';
import {markdownToDoc} from './markdownDoc';
import {docToMarkdown,docToPlainText} from './noteDoc';
import {getSchema} from '@tiptap/core';
import {buildContentExtensions} from './editorContent';
it('normalizes exclusive inline code marks and empty Markdown blocks for the real editor schema',()=>{
 const schema=getSchema(buildContentExtensions());
 for(const input of ['**`important()`**','***`code`***','>','-','1.','> -','[**`code`**](https://example.com)','- > quote','- ```js\n  let x = 1\n  ```','-\n  - 子项'])expect(()=>schema.nodeFromJSON(markdownToDoc(input)).check()).not.toThrow();
 expect(docToPlainText(markdownToDoc('**`important()`**'))).toBe('important()');
});
it('preserves later paragraphs in list items when copying Markdown',()=>{
 const original=markdownToDoc('- parent\n\n  second paragraph'),exported=docToMarkdown(original);
 expect(markdownToDoc(exported).content[0]!.content?.[0]?.content).toHaveLength(2);
 expect(exported).toContain('second paragraph');
});
it('turns classroom Markdown into editable headings, marks, nested lists and real code blocks',()=>{
 const source='## 模块化\n\n**重点**和 `import`\n\n1. 操作步骤\n   - 子步骤\n\n```javascript\nfunction showOne() {\n  console.log("你好");\n}\n```';
 const doc=markdownToDoc(source);
 getSchema(buildContentExtensions()).nodeFromJSON(doc).check();
 expect(doc.content[0]).toMatchObject({type:'heading',attrs:{level:2}});
 expect(doc.content[1]!.content).toContainEqual({type:'text',text:'重点',marks:[{type:'bold'}]});
 expect(doc.content[2]).toMatchObject({type:'orderedList',content:[{type:'listItem',content:[{type:'paragraph'},{type:'bulletList'}]}]});
 expect(doc.content.at(-1)).toMatchObject({type:'codeBlock',attrs:{language:'javascript'},content:[{text:expect.stringContaining('function showOne()')} ]});
 expect(docToMarkdown(doc)).toContain('## 模块化');expect(docToMarkdown(doc)).toMatch(/\n\s+- 子步骤/);expect(docToPlainText(doc)).not.toContain('**重点**');
});
it('keeps raw HTML inert, preserves tables, and unwraps only a whole Markdown envelope',()=>{
 const doc=markdownToDoc('```markdown\n# 标题\n\n|概念|作用|\n|-|-|\n|`blur`|失焦|\n\n<script>alert(1)</script>\n```');
 getSchema(buildContentExtensions()).nodeFromJSON(doc).check();
 expect(doc.content[0]?.type).toBe('heading');expect(doc.content.some(n=>n.type==='table')).toBe(true);
 expect(docToMarkdown(doc)).toContain('| 概念 | 作用 |');expect(docToMarkdown(doc)).toContain('| `blur` | 失焦 |');
 expect(docToPlainText(doc)).toContain('<script>');expect(JSON.stringify(doc)).not.toContain('"type":"script"');
});
