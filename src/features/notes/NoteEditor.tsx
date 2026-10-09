import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import { useEffect } from 'react';
import type { ReactElement } from 'react';
import { warmUpHighlighter } from '../../lib/highlight';
import type { Doc } from '../../lib/noteDoc';
import { buildEditorExtensions } from './editor/extensions';
import styles from './editor/editor.module.css';

export interface NoteEditorProps {
  /** 笔记正文 JSON；切换笔记时通过 key 重新挂载 */
  content: string;
  editable: boolean;
  onChange(json: string, plainText: string): void;
  onReady(editor: Editor): void;
  onFocusChange?(focused: boolean): void;
  label?: string;
}

/** TipTap 编辑器外壳：配置扩展、把实例交给上层（工具栏与大纲需要） */
export function NoteEditor({
  content,
  editable,
  onChange,
  onReady,
  onFocusChange,
  label = '笔记正文',
}: NoteEditorProps): ReactElement {
  const editor = useEditor({
    editable,
    extensions: buildEditorExtensions(),
    content: safeParse(content),
    editorProps: {
      attributes: {
        class: 'maji-prose',
        spellcheck: 'false',
        'aria-label': label,
        role: 'textbox',
        'aria-multiline': 'true',
      },
    },
    onUpdate: ({ editor: instance }) => {
      onChange(JSON.stringify(instance.getJSON()), instance.getText({ blockSeparator: '\n' }));
    },
    onFocus: () => onFocusChange?.(true),
    onBlur: () => onFocusChange?.(false),
  });

  useEffect(() => {
    warmUpHighlighter();
  }, []);

  useEffect(() => {
    if (editor) onReady(editor);
  }, [editor, onReady]);

  useEffect(() => {
    editor?.setEditable(editable);
  }, [editable, editor]);

  return (
    <div className={styles.content} data-editable={editable} data-testid="note-editor">
      <EditorContent editor={editor} />
    </div>
  );
}

function safeParse(content: string): Doc | string {
  try {
    return JSON.parse(content) as Doc;
  } catch {
    return content;
  }
}
