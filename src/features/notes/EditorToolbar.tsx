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
} from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { SegmentedControl, TextField } from '../../components/ui/Fields';
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

  const chain = () => editor?.chain().focus();

  return (
    <div className={styles.toolbar} role="toolbar" aria-label="编辑工具栏">
      <div className={styles.toolbarGroup}>
        <IconButton
          icon={Undo2}
          label="撤销"
          size="sm"
          disabled={!isEditable || !state?.canUndo}
          onClick={() => chain()?.undo().run()}
        />
        <IconButton
          icon={Redo2}
          label="重做"
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
          size="sm"
          active={state?.h1}
          disabled={!isEditable}
          onClick={() => chain()?.toggleHeading({ level: 1 }).run()}
        />
        <IconButton
          icon={Heading2}
          label="二级标题"
          size="sm"
          active={state?.h2}
          disabled={!isEditable}
          onClick={() => chain()?.toggleHeading({ level: 2 }).run()}
        />
        <IconButton
          icon={Heading3}
          label="三级标题"
          size="sm"
          active={state?.h3}
          disabled={!isEditable}
          onClick={() => chain()?.toggleHeading({ level: 3 }).run()}
        />
        <IconButton
          icon={Bold}
          label="加粗"
          size="sm"
          active={state?.bold}
          disabled={!isEditable}
          onClick={() => chain()?.toggleBold().run()}
        />
        <IconButton
          icon={Italic}
          label="斜体"
          size="sm"
          active={state?.italic}
          disabled={!isEditable}
          onClick={() => chain()?.toggleItalic().run()}
        />
        <IconButton
          icon={Strikethrough}
          label="删除线"
          size="sm"
          active={state?.strike}
          disabled={!isEditable}
          onClick={() => chain()?.toggleStrike().run()}
        />
        <IconButton
          icon={Code}
          label="行内代码"
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
      </div>

      <span className={styles.toolbarSpacer} />

      <span className={styles.toolbarStats}>
        约 {stats.words} 字
        {stats.codeBlocks > 0 ? ` · ${stats.codeBlocks} 段代码` : ''}
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
