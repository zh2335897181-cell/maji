import type { Editor } from '@tiptap/react';
import {
  ChevronRight,
  Download,
  Eye,
  FileText,
  FolderInput,
  ListTree,
  MoreHorizontal,
  Share2,
  Star,
  Trash2,
  X,
  Copy,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLibrary } from '../../app/LibraryProvider';
import { ROUTES } from '../../app/routes';
import { useToast } from '../../app/ToastProvider';
import { Button, IconButton } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { SelectField } from '../../components/ui/Fields';
import { Menu, type MenuEntry } from '../../components/ui/Menu';
import { ConfirmDialog, Modal } from '../../components/ui/Modal';
import { TopBarActions } from '../../components/layout/TopBar';
import { copyText } from '../../lib/clipboard';
import { useBreakpoints } from '../../lib/useMediaQuery';
import { noteStats } from '../../lib/noteDoc';
import { asDoc } from '../../lib/noteDoc';
import type { ExerciseInput, NoteStats } from '../../lib/types';
import { NoteEditor } from './NoteEditor';
import { AISelectionAssistant } from './AISelectionAssistant';
import { AICompletionAssistant } from './AICompletionAssistant';
import { EditorToolbar, type EditorMode } from './EditorToolbar';
import { NoteAside } from './NoteAside';
import { exportNoteAsMarkdown, noteMarkdown } from './exportNote';
import { useNoteDraft } from './useNoteDraft';
import styles from './notes.module.css';

const EMPTY_STATS: NoteStats = { words: 0, codeBlocks: 0, minutes: 1 };

/** 笔记编辑页：左侧课程导航（全局）+ 中间编辑区 + 右侧辅助栏 */
export function NoteEditorPage(): ReactElement {
  const { noteId } = useParams<{ noteId: string }>();
  const draft = useNoteDraft(noteId);
  const { notes, courses, updateNote, deleteNote, createExercise } = useLibrary();
  const { asideAutoHidden } = useBreakpoints();
  const toast = useToast();
  const navigate = useNavigate();

  const [editor, setEditor] = useState<Editor | null>(null);
  const [mode, setMode] = useState<EditorMode>('edit');
  const [stats, setStats] = useState<NoteStats>(EMPTY_STATS);
  const [asideOpen, setAsideOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [targetCourse, setTargetCourse] = useState('');

  const note = draft.note;
  const summary = useMemo(
    () => notes.find((item) => item.id === noteId) ?? null,
    [notes, noteId],
  );

  const handleEditorReady = useCallback((instance: Editor) => {
    setEditor(instance);
    setStats(noteStats(asDoc(instance.getJSON())));
  }, []);

  const handleEditorChange = useCallback(
    (json: string, plainText: string) => {
      draft.handleEditorChange(json, plainText);
      setStats(noteStats(asDoc(JSON.parse(json))));
    },
    [draft],
  );

  // Ctrl+P 切换编辑 / 预览
  useEffect(() => {
    const toggle = (): void => setMode((current) => (current === 'edit' ? 'preview' : 'edit'));
    window.addEventListener('maji:toggle-preview', toggle);
    return () => window.removeEventListener('maji:toggle-preview', toggle);
  }, []);

  const asideVisible = !asideAutoHidden || asideOpen;

  if (draft.loading) {
    return (
      <div className={styles.workspace}>
        <div className={styles.center}>
          <div className={styles.loadingNote} aria-busy="true" aria-label="正在打开笔记">
            <span className={styles.skeletonTitle} />
            <span className={styles.skeletonLine} style={{ width: '86%' }} />
            <span className={styles.skeletonLine} style={{ width: '72%' }} />
            <span className={styles.skeletonLine} style={{ width: '90%' }} />
          </div>
        </div>
      </div>
    );
  }

  if (draft.missing || !note || !draft.initialContent) {
    return (
      <div className={styles.workspace}>
        <div className={styles.center}>
          <EmptyState
            icon={FileText}
            title="这篇笔记不存在或已被删除"
            description="它可能已经被移除。你可以回到学习首页，或从课程目录里选择另一篇笔记。"
            actions={
              <>
                <Button variant="primary" onClick={() => navigate(ROUTES.home)}>
                  回到学习首页
                </Button>
                <Button variant="secondary" onClick={() => navigate(ROUTES.courses)}>
                  浏览课程与笔记
                </Button>
              </>
            }
          />
        </div>
      </div>
    );
  }

  const course = courses.find((item) => item.id === note.courseId);

  const exportItems: MenuEntry[] = [
    {
      id: 'export-md',
      label: '导出为 Markdown',
      icon: Download,
      onSelect: () => {
        void exportNoteAsMarkdown(draft.title, note.contentJson).then((result) => {
          toast.show({ message: result.message, tone: result.saved ? 'success' : 'info' });
        });
      },
    },
    {
      id: 'copy-md',
      label: '复制 Markdown 到剪贴板',
      icon: Copy,
      onSelect: () => {
        void copyText(noteMarkdown(draft.title, JSON.stringify(editor?.getJSON() ?? {}))).then(
          (ok) => toast.show(ok ? 'Markdown 已复制' : '复制失败，请检查系统剪贴板权限'),
        );
      },
    },
  ];

  const moreItems: MenuEntry[] = [
    { id: 'mindmap', label: 'AI 生成思维导图', icon: ListTree, onSelect: () => { void draft.saveNow().then(saved => { if (saved) navigate(`${ROUTES.mindMaps}?note=${encodeURIComponent(note.id)}`); else toast.show({ message: '笔记保存失败，请重试后生成思维导图', tone: 'error' }); }); } },
    {
      id: 'favorite',
      label: draft.favorite ? '取消收藏' : '加入收藏',
      icon: Star,
      checked: draft.favorite,
      onSelect: () => {
        void draft.toggleFavorite().then(() => {
          toast.show(draft.favorite ? '已取消收藏' : '已加入收藏');
        });
      },
    },
    {
      id: 'move',
      label: '移动到其他课程',
      icon: FolderInput,
      onSelect: () => {
        setTargetCourse(note.courseId);
        setMoveOpen(true);
      },
    },
    { id: 'sep', separator: true },
    { id: 'delete', label: '删除这篇笔记', icon: Trash2, danger: true, onSelect: () => setDeleteOpen(true) },
  ];

  return (
    <div className={styles.workspace}>
      <div className={styles.center}>
        <div className={styles.docHeader}>
          <nav className={styles.breadcrumb} aria-label="当前位置">
            <Link to={ROUTES.coursesWith({ courseId: note.courseId })}>
              {course?.name ?? '未分类课程'}
            </Link>
            <ChevronRight size={12} aria-hidden />
            <span className={styles.breadcrumbCurrent}>{draft.title || '未命名笔记'}</span>
          </nav>

          <div className={styles.titleRow}>
            <input
              className={styles.titleInput}
              value={draft.title}
              aria-label="笔记标题"
              placeholder="未命名笔记"
              onChange={(event) => draft.setTitle(event.target.value)}
            />
            <div className={styles.docActions}>
              <IconButton
                icon={Star}
                label={draft.favorite ? '取消收藏' : '加入收藏'}
                size="sm"
                active={draft.favorite}
                onClick={() => {
                  void draft.toggleFavorite().then(() =>
                    toast.show(draft.favorite ? '已取消收藏' : '已加入收藏'),
                  );
                }}
              />
              <Menu label="分享与导出" icon={Share2} text="导出" items={exportItems} align="end" />
              <Menu label="更多操作" icon={MoreHorizontal} items={moreItems} align="end" />
            </div>
          </div>
        </div>

        <EditorToolbar
          editor={editor}
          mode={mode}
          onModeChange={setMode}
          language={note.language}
          stats={stats}
        />

        {mode === 'preview' ? (
          <div className={styles.previewNotice} role="status">
            <Eye size={13} aria-hidden />
            阅读预览 · 正文为只读状态，按 Ctrl+P 或点击右上角「编辑」继续修改
          </div>
        ) : null}

        <div className={styles.scroll} data-editor-scroll>
          <div className={styles.paper}>
            <NoteEditor
              key={note.id}
              content={draft.initialContent}
              editable={mode === 'edit'}
              onChange={handleEditorChange}
              onReady={handleEditorReady}
            />
          </div>
        </div>
        <AISelectionAssistant
          editor={editor}
          editable={mode === 'edit'}
          noteId={note.id}
          noteText={editor?.getText({ blockSeparator: '\n' }) ?? ''}
          language={note.language}
          courseId={note.courseId}
          onCreateExercise={async (input: ExerciseInput) => {
            await createExercise(input);
            toast.show({ message: '已添加关联练习', tone: 'success' });
          }}
          onOpenSettings={() => window.dispatchEvent(new Event('maji:open-ai-settings'))}
        />
        <AICompletionAssistant
          editor={editor}
          editable={mode === 'edit'}
          language={note.language}
          onOpenSettings={() => window.dispatchEvent(new Event('maji:open-ai-settings'))}
        />
      </div>

      {asideVisible ? (
        <div className={styles.asideWrap} data-overlay={asideAutoHidden || undefined}>
          {asideAutoHidden ? (
            <div className={styles.asideOverlayHeader}>
              <span>笔记辅助信息</span>
              <IconButton icon={X} label="收起辅助栏" size="sm" onClick={() => setAsideOpen(false)} />
            </div>
          ) : null}
          <NoteAside
            note={
              summary ?? {
                ...note,
                courseName: course?.name ?? '未分类',
                courseColorKey: course?.colorKey ?? 'slate',
              }
            }
            editor={editor}
            tags={draft.tags}
            onTagsChange={draft.setTags}
          />
        </div>
      ) : null}

      <TopBarActions>
        {asideAutoHidden ? (
          <IconButton
            icon={ListTree}
            label={asideOpen ? '收起笔记大纲' : '展开笔记大纲'}
            active={asideOpen}
            onClick={() => setAsideOpen((open) => !open)}
          />
        ) : null}
      </TopBarActions>

      <Modal
        open={moveOpen}
        onClose={() => setMoveOpen(false)}
        title="移动笔记"
        description={`把「${draft.title}」移动到另一门课程。`}
        icon={FolderInput}
        footer={
          <>
            <Button variant="secondary" onClick={() => setMoveOpen(false)}>
              取消
            </Button>
            <Button
              variant="primary"
              disabled={!targetCourse || targetCourse === note.courseId}
              onClick={() => {
                void updateNote(note.id, { courseId: targetCourse }).then(() => {
                  setMoveOpen(false);
                  toast.show('已移动到新课程');
                });
              }}
            >
              移动
            </Button>
          </>
        }
      >
        <SelectField
          label="目标课程"
          value={targetCourse}
          onChange={(event) => setTargetCourse(event.target.value)}
          options={courses.map((item) => ({ value: item.id, label: item.name }))}
        />
      </Modal>

      <ConfirmDialog
        open={deleteOpen}
        title="删除这篇笔记？"
        description="删除后无法恢复，关联的复习知识点也会一并移除。"
        icon={Trash2}
        confirmLabel="删除笔记"
        details={
          <div className={styles.deleteDetails}>
            <strong>{draft.title}</strong>
            <span>
              {course?.name ?? '未分类'} · 约 {stats.words} 字
              {stats.codeBlocks > 0 ? ` · ${stats.codeBlocks} 段代码` : ''}
            </span>
          </div>
        }
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => {
          void deleteNote(note.id).then(() => {
            setDeleteOpen(false);
            toast.show({ message: `已删除「${draft.title}」`, tone: 'info' });
            navigate(ROUTES.coursesWith({ courseId: note.courseId }));
          });
        }}
      />
    </div>
  );
}
