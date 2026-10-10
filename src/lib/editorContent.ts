// Shared document schema for the editor and desktop backup validation. No DOM or React views.
import { Node, mergeAttributes, type AnyExtension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { CodeBlock } from '@tiptap/extension-code-block';
import Highlight from '@tiptap/extension-highlight';
import { Image } from '@tiptap/extension-image';
import { TableKit } from '@tiptap/extension-table';
import { TaskItem } from '@tiptap/extension-task-item';
import { TaskList } from '@tiptap/extension-task-list';

export const CalloutContent = Node.create({
  name: 'callout', group: 'block', content: 'block+', defining: true, selectable: true,
  addAttributes() { return {
    variant: { default: 'note', parseHTML: element => element.getAttribute('data-variant') ?? 'note', renderHTML: attrs => ({'data-variant':String(attrs.variant ?? 'note')}) },
    label: { default: '', parseHTML: element => element.getAttribute('data-label') ?? '', renderHTML: attrs => ({'data-label':String(attrs.label ?? '')}) },
  }; },
  parseHTML() { return [{tag:'div[data-callout]'}]; },
  renderHTML({HTMLAttributes}) { return ['div',mergeAttributes(HTMLAttributes,{'data-callout':''}),0]; },
});

export function buildContentExtensions(codeBlock: AnyExtension = CodeBlock, callout: AnyExtension = CalloutContent) {
  return [
    StarterKit.configure({codeBlock:false,heading:{levels:[1,2,3]},link:{openOnClick:false,autolink:true,HTMLAttributes:{rel:'noopener noreferrer',target:'_blank'}}}),
    codeBlock.configure({defaultLanguage:'text',languageClassPrefix:'language-',enableTabIndentation:true,tabSize:4}),
    callout, TaskList, TaskItem.configure({nested:true}),
    TableKit.configure({table:{resizable:false}}), Highlight.configure({multicolor:true}),
    Image.configure({inline:false,allowBase64:true}),
  ];
}
