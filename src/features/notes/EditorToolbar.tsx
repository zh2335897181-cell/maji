import type { Editor } from '@tiptap/react';
import { useEditorState } from '@tiptap/react';
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  Italic,
  Lightbulb,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Strikethrough,
  Terminal,
  TriangleAlert,
  Undo2,
  Info,
  Eye,
  PenLine,
  Highlighter,
  Keyboard,
  Table2,
} from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { Kbd, SegmentedControl, TextField } from '../../components/ui/Fields';
import { Button, IconButton } from '../../components/ui/Button';
import { Menu, type MenuEntry } from '../../components/ui/Menu';
import { Modal } from '../../components/ui/Modal';
import type { LanguageId, NoteStats } from '../../lib/types';
import { CALLOUT_VARIANTS, type CalloutVariant } from '../../lib/noteDoc';
import styles from './notes.module.css';

export type EditorMode = 'edit' | 'preview';

export interface EditorToolbarProps {
  editor: Editor | null;
  mode: EditorMode;
  onModeChange(mode: EditorMode): void;
  /** 新建代码块时的默认语言 */
  language: LanguageId;
  stats: NoteStats;
}

const CALLOUT_ICONS: Record<CalloutVariant, typeof Info> = {
  note: Info,
  tip: Lightbulb,
  warning: TriangleAlert,
  output: Terminal,
};

/** 编辑工具栏：所有按钮在编辑/预览两种模式下都有明确的可用与选中状态 */
export function EditorToolbar({
  editor,
  mode,
  onModeChange,
  language,
  stats,
}: EditorToolbarProps): ReactElement {
  const [linkDialog, setLinkDialog] = useState(false);
  const [imageDialog, setImageDialog] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const isEditable = mode === 'edit';

  const state = useEditorState({
    editor,
    selector: ({ editor: instance }) => {
      if (!instance) {
        return {
          bold: false,
          italic: false,
          strike: false,
          code: false,
          h1: false,
          h2: false,
          h3: false,
          bulletList: false,
          orderedList: false,
          taskList: false,
          blockquote: false,
          codeBlock: false,
          highlight: false,
          table: false,
          callout: false,
          link: false,
          canUndo: false,
          canRedo: false,
        };
      }
      return {
        bold: instance.isActive('bold'),
        italic: instance.isActive('italic'),
        strike: instance.isActive('strike'),
        code: instance.isActive('code'),
        h1: instance.isActive('heading', { level: 1 }),
        h2: instance.isActive('heading', { level: 2 }),
        h3: instance.isActive('heading', { level: 3 }),
        bulletList: instance.isActive('bulletList'),
        orderedList: instance.isActive('orderedList'),
        taskList: instance.isActive('taskList'),
        blockquote: instance.isActive('blockquote'),
        codeBlock: instance.isActive('codeBlock'),
        highlight: instance.isActive('highlight'),
        table: instance.isActive('table'),
        callout: instance.isActive('callout'),
        link: instance.isActive('link'),
        canUndo: instance.can().undo(),
        canRedo: instance.can().redo(),
      };
    },
  });

  const calloutItems: MenuEntry[] = (Object.keys(CALLOUT_VARIANTS) as CalloutVariant[]).map(
    (variant) => ({
      id: variant,
      label: CALLOUT_VARIANTS[variant].action,
      icon: CALLOUT_ICONS[variant],
      checked: editor?.isActive('callout', { variant }) ?? false,
      onSelect: () => editor?.chain().focus().toggleCallout({ variant }).run(),
    }),
  );

  const tableItems: MenuEntry[] = [
    { id: 'insert-3x3', label: '插入 3 × 3 表格', icon: Table2, hint: 'Ctrl Alt T', onSelect: () => chain()?.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
    { id: 'insert-2x3', label: '插入 2 × 3 表格', icon: Table2, onSelect: () => chain()?.insertTable({ rows: 2, cols: 3, withHeaderRow: true }).run() },
    { id: 'table-separator', separator: true },
    { id: 'row-after', label: '在下方添加行', disabled: !state?.table, onSelect: () => chain()?.addRowAfter().run() },
    { id: 'column-after', label: '在右侧添加列', disabled: !state?.table, onSelect: () => chain()?.addColumnAfter().run() },
    { id: 'delete-row', label: '删除当前行', disabled: !state?.table, onSelect: () => chain()?.deleteRow().run() },
    { id: 'delete-column', label: '删除当前列', disabled: !state?.table, onSelect: () => chain()?.deleteColumn().run() },
    { id: 'delete-table', label: '删除表格', disabled: !state?.table, danger: true, onSelect: () => chain()?.deleteTable().run() },
  ];

  const highlightColors = [
    { color: '#fff3a3', label: '黄色重点' },
    { color: '#c9f2dc', label: '绿色提示' },
    { color: '#cfe8ff', label: '蓝色补充' },
    { color: '#ffd9d5', label: '红色易错' },
  ];
  const highlightItems: MenuEntry[] = highlightColors.map(({ color, label }) => ({
    id: color,
    label,
    icon: Highlighter,
    checked: editor?.isActive('highlight', { color }) ?? false,
    onSelect: () => editor?.chain().focus().toggleHighlight({ color }).run(),
  }));

  const chain = () => editor?.chain().focus();

  return (
    <div className={styles.toolbar} role="toolbar" aria-label="编辑工具栏">
      <div className={styles.toolbarGroup}>
        <IconButton
          icon={Undo2}
          label="撤销"
          shortcut="Ctrl+Z"
          size="sm"
          disabled={!isEditable || !state?.canUndo}
          onClick={() => chain()?.undo().run()}
        />
        <IconButton
          icon={Redo2}
          label="重做"
          shortcut="Ctrl+Shift+Z"
          size="sm"
          disabled={!isEditable || !state?.canRedo}
          onClick={() => chain()?.redo().run()}
        />
      </div>

      <span className={styles.toolbarDivider} aria-hidden />

      <div className={styles.toolbarGroup}>
        <IconButton
          icon={Heading1}
          label="一级标题"
          shortcut="Ctrl+Shift+1"
          size="sm"
          active={state?.h1}
          disabled={!isEditable}
          onClick={() => chain()?.toggleHeading({ level: 1 }).run()}
        />
        <IconButton
          icon={Heading2}
          label="二级标题"
          shortcut="Ctrl+Shift+2"
          size="sm"
          active={state?.h2}
          disabled={!isEditable}
          onClick={() => chain()?.toggleHeading({ level: 2 }).run()}
        />
        <IconButton
          icon={Heading3}
          label="三级标题"
          shortcut="Ctrl+Shift+3"
          size="sm"
          active={state?.h3}
          disabled={!isEditable}
          onClick={() => chain()?.toggleHeading({ level: 3 }).run()}
        />
        <IconButton
          icon={Bold}
          label="加粗"
          shortcut="Ctrl+B"
          size="sm"
          active={state?.bold}
          disabled={!isEditable}
          onClick={() => chain()?.toggleBold().run()}
        />
        <IconButton
          icon={Italic}
          label="斜体"
          shortcut="Ctrl+I"
          size="sm"
          active={state?.italic}
          disabled={!isEditable}
          onClick={() => chain()?.toggleItalic().run()}
        />
        <IconButton
          icon={Strikethrough}
          label="删除线"
          shortcut="Ctrl+Shift+X"
          size="sm"
          active={state?.strike}
          disabled={!isEditable}
          onClick={() => chain()?.toggleStrike().run()}
        />
        <IconButton
          icon={Code}
          label="行内代码"
          shortcut="Ctrl+E"
          size="sm"
          active={state?.code}
          disabled={!isEditable}
          onClick={() => chain()?.toggleCode().run()}
        />
      </div>

      <span className={styles.toolbarDivider} aria-hidden />

      <div className={styles.toolbarGroup}>
        <IconButton
          icon={List}
          label="无序列表"
          size="sm"
          active={state?.bulletList}
          disabled={!isEditable}
          onClick={() => chain()?.toggleBulletList().run()}
        />
        <IconButton
          icon={ListOrdered}
          label="有序列表"
          size="sm"
          active={state?.orderedList}
          disabled={!isEditable}
          onClick={() => chain()?.toggleOrderedList().run()}
        />
        <IconButton
          icon={ListChecks}
          label="待办清单"
          size="sm"
          active={state?.taskList}
          disabled={!isEditable}
          onClick={() => chain()?.toggleTaskList().run()}
        />
        <IconButton
          icon={Quote}
          label="引用"
          size="sm"
          active={state?.blockquote}
          disabled={!isEditable}
          onClick={() => chain()?.toggleBlockquote().run()}
        />
      </div>

      <span className={styles.toolbarDivider} aria-hidden />

      <div className={styles.toolbarGroup}>
        <IconButton
          icon={Terminal}
          label="代码块"
          shortcut="Ctrl+Alt+C"
          size="sm"
          active={state?.codeBlock}
          disabled={!isEditable}
          onClick={() => chain()?.toggleCodeBlock({ language }).run()}
        />
        <Menu
          label="插入语义块"
          icon={Lightbulb}
          text="语义块"
          items={calloutItems}
          align="start"
          disabled={!isEditable}
        />
        <IconButton
          icon={Link2}
          label="插入链接"
          size="sm"
          active={state?.link}
          disabled={!isEditable}
          onClick={() => {
            setLinkUrl(editor?.getAttributes('link')['href'] ?? '');
            setLinkDialog(true);
          }}
        />
        <IconButton
          icon={ImageIcon}
          label="插入图片"
          size="sm"
          disabled={!isEditable}
          onClick={() => setImageDialog(true)}
        />
        <IconButton
          icon={Minus}
          label="分割线"
          size="sm"
          disabled={!isEditable}
          onClick={() => chain()?.setHorizontalRule().run()}
        />
        <Menu label="插入表格与编辑表格" icon={Table2} text="表格" items={tableItems} align="start" disabled={!isEditable} />
        <Menu label="高亮文字" icon={Highlighter} items={highlightItems} align="start" disabled={!isEditable} />
      </div>

      <span className={styles.toolbarSpacer} />

      <span className={styles.toolbarStats}>
        约 {stats.words} 字
        {stats.codeBlocks > 0 ? ` · ${stats.codeBlocks} 段代码` : ''}
      </span>

      <span className={styles.toolbarShortcutHelp}>
        <IconButton
          icon={Keyboard}
          label="快捷键帮助"
          shortcut="Ctrl+/"
          size="sm"
          onClick={() => window.dispatchEvent(new Event('maji:open-shortcuts'))}
        />
        <Kbd>Ctrl /</Kbd>
      </span>

      <SegmentedControl<EditorMode>
        label="编辑与预览"
        value={mode}
        onChange={onModeChange}
        options={[
          { value: 'edit', label: '编辑', icon: PenLine },
          { value: 'preview', label: '预览', icon: Eye },
        ]}
      />

      <Modal
        open={linkDialog}
        onClose={() => setLinkDialog(false)}
        title={state?.link ? '修改链接' : '插入链接'}
        description="粘贴以 https:// 开头的地址，保存后在阅读模式下可点击打开。"
        icon={Link2}
        footer={
          <>
            {state?.link ? (
              <Button
                variant="dangerGhost"
                onClick={() => {
                  chain()?.extendMarkRange('link').unsetLink().run();
                  setLinkDialog(false);
                }}
              >
                移除链接
              </Button>
            ) : null}
            <Button variant="secondary" onClick={() => setLinkDialog(false)}>
              取消
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                const href = linkUrl.trim();
                if (!href) {
                  chain()?.extendMarkRange('link').unsetLink().run();
                } else if (/^https?:\/\//i.test(href)) {
                  chain()?.extendMarkRange('link').setLink({ href }).run();
                } else {
                  chain()?.extendMarkRange('link').setLink({ href: `https://${href}` }).run();
                }
                setLinkDialog(false);
              }}
            >
              确定
            </Button>
          </>
        }
      >
        <TextField
          label="链接地址"
          example="https://docs.python.org/zh-cn/3/tutorial/controlflow.html"
          value={linkUrl}
          onChange={(event) => setLinkUrl(event.target.value)}
          autoFocus
        />
      </Modal>

      <Modal
        open={imageDialog}
        onClose={() => setImageDialog(false)}
        title="插入图片"
        description="支持图片地址或本地图片的 data URL。"
        icon={ImageIcon}
        footer={
          <>
            <Button variant="secondary" onClick={() => setImageDialog(false)}>
              取消
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                const src = imageUrl.trim();
                if (src) chain()?.setImage({ src }).run();
                setImageDialog(false);
              }}
            >
              插入
            </Button>
          </>
        }
      >
        <TextField
          label="图片地址"
          example="https://example.com/box-model.png"
          value={imageUrl}
          onChange={(event) => setImageUrl(event.target.value)}
          autoFocus
        />
      </Modal>
    </div>
  );
}
