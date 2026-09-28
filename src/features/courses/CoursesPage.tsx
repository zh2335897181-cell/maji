import {
  Archive,
  FileText,
  FolderInput,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Star,
  Tag as TagIcon,
  Trash2,
} from 'lucide-react';
import { useMemo, useState, type ReactElement } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useLibrary } from '../../app/LibraryProvider';
import { ROUTES } from '../../app/routes';
import { useToast } from '../../app/ToastProvider';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { SelectField, TextField } from '../../components/ui/Fields';
import { Menu, type MenuEntry } from '../../components/ui/Menu';
import { ConfirmDialog, Modal } from '../../components/ui/Modal';
import { StatusDot, Tag } from '../../components/ui/Tag';
import { courseColorVar } from '../../lib/icons';
import { LANGUAGE_OPTIONS, languageName } from '../../lib/languages';
import { formatRelativeTime } from '../../lib/format';
import type { Course, NoteSummary } from '../../lib/types';
import { CourseEditorDialog } from './CourseEditorDialog';
import styles from './courses.module.css';

type Scope = 'all' | 'favorite' | 'unreviewed';
type SortKey = 'updated' | 'title' | 'created';

/** 课程与笔记管理页：左侧按课程 / 标签浏览，右侧查看、重命名、移动、收藏、删除笔记 */
export function CoursesPage(): ReactElement {
  const { notes, courses, tags, noteReviewMap, updateNote, deleteNote, deleteCourse } = useLibrary();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();

  const courseFilter = params.get('course') ?? '';
  const tagFilter = params.get('tag') ?? '';
  const [scope, setScope] = useState<Scope>('all');
  const [language, setLanguage] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('updated');
  const [keyword, setKeyword] = useState('');

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [movingNote, setMovingNote] = useState<NoteSummary | null>(null);
  const [moveTarget, setMoveTarget] = useState('');
  const [deletingNote, setDeletingNote] = useState<NoteSummary | null>(null);
  const [courseDialog, setCourseDialog] = useState<{ open: boolean; course: Course | null }>({
    open: false,
    course: null,
  });
  const [deletingCourse, setDeletingCourse] = useState<Course | null>(null);
  const [courseError, setCourseError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let list = [...notes];
    if (courseFilter) list = list.filter((note) => note.courseId === courseFilter);
    if (tagFilter) list = list.filter((note) => note.tags.includes(tagFilter));
    if (scope === 'favorite') list = list.filter((note) => note.favorite);
    if (scope === 'unreviewed') list = list.filter((note) => !noteReviewMap.has(note.id));
    if (language) list = list.filter((note) => note.language === language);
    if (keyword.trim()) {
      const query = keyword.trim().toLowerCase();
      list = list.filter(
        (note) =>
          note.title.toLowerCase().includes(query) || note.excerpt.toLowerCase().includes(query),
      );
    }
    list.sort((a, b) => {
      if (sortKey === 'title') return a.title.localeCompare(b.title, 'zh-Hans-CN');
      if (sortKey === 'created') {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
    return list;
  }, [notes, courseFilter, tagFilter, scope, language, keyword, sortKey, noteReviewMap]);

  const activeCourse = courses.find((course) => course.id === courseFilter) ?? null;

  const commitRename = (note: NoteSummary): void => {
    const title = renameDraft.trim();
    setRenamingId(null);
    if (!title || title === note.title) return;
    void updateNote(note.id, { title }).then(() => toast.show('标题已更新'));
  };

  const rowMenu = (note: NoteSummary): MenuEntry[] => [
    { id: 'open', label: '打开笔记', icon: FileText, onSelect: () => navigate(ROUTES.note(note.id)) },
    {
      id: 'rename',
      label: '重命名',
      icon: Pencil,
      onSelect: () => {
        setRenameDraft(note.title);
        setRenamingId(note.id);
      },
    },
    {
      id: 'move',
      label: '移动到课程…',
      icon: FolderInput,
      onSelect: () => {
        setMoveTarget(note.courseId);
        setMovingNote(note);
      },
    },
    {
      id: 'favorite',
      label: note.favorite ? '取消收藏' : '加入收藏',
      icon: Star,
      checked: note.favorite,
      onSelect: () => {
        void updateNote(note.id, { favorite: !note.favorite }).then(() =>
          toast.show(note.favorite ? '已取消收藏' : '已加入收藏'),
        );
      },
    },
    { id: 'sep', separator: true },
    {
      id: 'delete',
      label: '删除笔记',
      icon: Trash2,
      danger: true,
      onSelect: () => setDeletingNote(note),
    },
  ];

  return (
    <div className={styles.layout}>
      <aside className={styles.browser} aria-label="浏览方式">
        <div className={styles.browserGroup}>
          <span className={styles.browserTitle}>快速筛选</span>
          <button
            type="button"
            className={`${styles.browserRow} ${
              !courseFilter && !tagFilter && scope === 'all' ? styles.browserRowActive : ''
            }`}
            onClick={() => {
              setParams({});
              setScope('all');
            }}
          >
            <FileText size={14} aria-hidden />
            <span className={styles.browserRowMain}>全部笔记</span>
            <span className={styles.browserCount}>{notes.length}</span>
          </button>
          <button
            type="button"
            className={`${styles.browserRow} ${scope === 'favorite' ? styles.browserRowActive : ''}`}
            onClick={() => {
              setParams({});
              setScope('favorite');
            }}
          >
            <Star size={14} aria-hidden />
            <span className={styles.browserRowMain}>收藏</span>
            <span className={styles.browserCount}>
              {notes.filter((note) => note.favorite).length}
            </span>
          </button>
          <button
            type="button"
            className={`${styles.browserRow} ${scope === 'unreviewed' ? styles.browserRowActive : ''}`}
            onClick={() => {
              setParams({});
              setScope('unreviewed');
            }}
          >
            <Archive size={14} aria-hidden />
            <span className={styles.browserRowMain}>未安排复习</span>
            <span className={styles.browserCount}>
              {notes.filter((note) => !noteReviewMap.has(note.id)).length}
            </span>
          </button>
        </div>

        <div className={styles.browserGroup}>
          <span className={styles.browserTitle}>课程</span>
          {courses.map((course) => {
            const count = notes.filter((note) => note.courseId === course.id).length;
            const active = courseFilter === course.id;
            return (
              <div
                key={course.id}
                className={`${styles.browserRow} ${active ? styles.browserRowActive : ''}`}
              >
                <button
                  type="button"
                  className={`${styles.browserRowMain} ${styles.browserCourseButton}`}
                  onClick={() => {
                    setParams({ course: course.id });
                    setScope('all');
                  }}
                >
                  <span
                    className={styles.courseDot}
                    style={{ background: courseColorVar(course.colorKey) }}
                    aria-hidden
                  />
                  {course.name}
                </button>
                <span className={styles.browserCount}>{count}</span>
                <span className={styles.browserRowMenu}>
                  <Menu
                    label={`${course.name} 课程操作`}
                    icon={MoreHorizontal}
                    align="end"
                    items={[
                      {
                        id: 'edit',
                        label: '编辑课程信息',
                        icon: Pencil,
                        onSelect: () => setCourseDialog({ open: true, course }),
                      },
                      {
                        id: 'new-note',
                        label: '在这门课程下新建笔记',
                        icon: Plus,
                        onSelect: () => navigate(ROUTES.createWith('note', { course: course.id })),
                      },
                      { id: 'sep', separator: true },
                      {
                        id: 'delete',
                        label: '删除课程',
                        icon: Trash2,
                        danger: true,
                        onSelect: () => {
                          setCourseError(null);
                          setDeletingCourse(course);
                        },
                      },
                    ]}
                  />
                </span>
              </div>
            );
          })}
          <button
            type="button"
            className={styles.browserRow}
            onClick={() => setCourseDialog({ open: true, course: null })}
          >
            <Plus size={14} aria-hidden />
            <span className={styles.browserRowMain}>新建课程</span>
          </button>
        </div>

        {tags.length > 0 ? (
          <div className={styles.browserGroup}>
            <span className={styles.browserTitle}>标签</span>
            {tags.slice(0, 10).map((tag) => (
              <button
                key={tag.name}
                type="button"
                className={`${styles.browserRow} ${tagFilter === tag.name ? styles.browserRowActive : ''}`}
                onClick={() => {
                  setParams({ tag: tag.name });
                  setScope('all');
                }}
              >
                <TagIcon size={13} aria-hidden />
                <span className={styles.browserRowMain}>{tag.name}</span>
                <span className={styles.browserCount}>{tag.noteCount}</span>
              </button>
            ))}
          </div>
        ) : null}
      </aside>

      <div className={styles.main}>
        <div className={styles.toolbar}>
          <div className={styles.toolbarSearch}>
            <TextField
              aria-label="在列表中筛选"
              placeholder="在列表中筛选标题或摘要"
              icon={Search}
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
            />
          </div>

          <div className={styles.selectSmall}>
            <SelectField
              aria-label="按语言筛选"
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
              options={[{ value: '', label: '全部语言' }, ...LANGUAGE_OPTIONS]}
            />
          </div>

          <div className={styles.selectSmall}>
            <SelectField
              aria-label="排序方式"
              value={sortKey}
              onChange={(event) => setSortKey(event.target.value as SortKey)}
              options={[
                { value: 'updated', label: '按更新时间' },
                { value: 'created', label: '按创建时间' },
                { value: 'title', label: '按标题' },
              ]}
            />
          </div>

          <span className={styles.toolbarSpacer} />

          {activeCourse ? (
            <Tag tone="accent" onRemove={() => setParams({})}>
              课程：{activeCourse.name}
            </Tag>
          ) : null}
          {tagFilter ? (
            <Tag tone="accent" onRemove={() => setParams({})}>
              标签：{tagFilter}
            </Tag>
          ) : null}

          <Button
            variant="primary"
            icon={Plus}
            onClick={() =>
              navigate(ROUTES.createWith('note', courseFilter ? { course: courseFilter } : undefined))
            }
          >
            新建笔记
          </Button>
        </div>

        <div className={styles.scroll} data-scroll-container>
          {filtered.length === 0 ? (
            notes.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="还没有任何笔记"
                description="新建第一篇笔记，把课堂上的知识点、代码示例和报错记录放在一起。"
                actions={
                  <Button
                    variant="primary"
                    icon={Plus}
                    onClick={() => navigate(ROUTES.createWith('note'))}
                  >
                    新建笔记
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={Search}
                title="这个筛选条件下没有笔记"
                description="换个课程、语言或关键词试试，也可以清空筛选查看全部笔记。"
                actions={
                  <>
                    <Button
                      variant="primary"
                      onClick={() => {
                        setParams({});
                        setScope('all');
                        setLanguage('');
                        setKeyword('');
                      }}
                    >
                      清空筛选
                    </Button>
                    <Button
                      variant="secondary"
                      icon={Plus}
                      onClick={() => navigate(ROUTES.createWith('note'))}
                    >
                      新建笔记
                    </Button>
                  </>
                }
              />
            )
          ) : (
            <>
              <div className={styles.listHeader} aria-hidden>
                <span>笔记</span>
                <span>课程</span>
                <span>语言</span>
                <span>更新时间</span>
                <span>复习状态</span>
                <span />
              </div>

              <div className={styles.listPanel}>
                {filtered.map((note) => {
                  const review = noteReviewMap.get(note.id);
                  const course = courses.find((item) => item.id === note.courseId);
                  return (
                    <div className={styles.noteRow} key={note.id}>
                      <div className={styles.noteMain}>
                        {renamingId === note.id ? (
                          <input
                            className={styles.renameInput}
                            value={renameDraft}
                            autoFocus
                            aria-label="重命名笔记"
                            onChange={(event) => setRenameDraft(event.target.value)}
                            onBlur={() => commitRename(note)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') commitRename(note);
                              if (event.key === 'Escape') setRenamingId(null);
                            }}
                          />
                        ) : (
                          <Link className={styles.noteTitle} to={ROUTES.note(note.id)}>
                            {note.favorite ? (
                              <Star
                                size={12}
                                aria-label="已收藏"
                                className={styles.titleStar}
                                fill="currentColor"
                              />
                            ) : null}
                            <span className={styles.noteTitleText}>{note.title}</span>
                          </Link>
                        )}
                        <span className={styles.noteExcerpt}>{note.excerpt || '（暂无摘要）'}</span>
                      </div>

                      <span className={styles.cell}>{course?.name ?? '未分类'}</span>
                      <span className={styles.cell}>
                        <Tag mono>{languageName(note.language)}</Tag>
                      </span>
                      <span className={styles.cell}>{formatRelativeTime(note.updatedAt)}</span>
                      <span className={styles.cell}>
                        {review ? (
                          <span className={styles.reviewCell}>
                            <StatusDot tone={review.tone} />
                            {review.label}
                          </span>
                        ) : (
                          <span className={styles.mutedCell}>未安排</span>
                        )}
                      </span>
                      <span className={styles.rowMenu}>
                        <Menu
                          label={`${note.title} 的操作`}
                          icon={MoreHorizontal}
                          align="end"
                          items={rowMenu(note)}
                        />
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className={styles.listFooter}>
                <span>
                  共 {filtered.length} 篇笔记
                  {filtered.length !== notes.length ? `（已从 ${notes.length} 篇中筛选）` : ''}
                </span>
                <button
                  type="button"
                  className={styles.linkButton}
                  onClick={() => navigate(ROUTES.search)}
                >
                  用搜索查找正文与代码 →
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <CourseEditorDialog
        open={courseDialog.open}
        course={courseDialog.course}
        onClose={() => setCourseDialog({ open: false, course: null })}
      />

      <Modal
        open={movingNote !== null}
        onClose={() => setMovingNote(null)}
        title="移动笔记"
        description={movingNote ? `把「${movingNote.title}」移动到另一门课程。` : ''}
        icon={FolderInput}
        footer={
          <>
            <Button variant="secondary" onClick={() => setMovingNote(null)}>
              取消
            </Button>
            <Button
              variant="primary"
              disabled={!movingNote || moveTarget === movingNote.courseId}
              onClick={() => {
                if (!movingNote) return;
                void updateNote(movingNote.id, { courseId: moveTarget }).then(() => {
                  setMovingNote(null);
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
          value={moveTarget}
          onChange={(event) => setMoveTarget(event.target.value)}
          options={courses.map((course) => ({ value: course.id, label: course.name }))}
        />
      </Modal>

      <ConfirmDialog
        open={deletingNote !== null}
        title="删除这篇笔记？"
        description="删除后无法恢复，关联的复习知识点会一并移除。"
        icon={Trash2}
        confirmLabel="删除笔记"
        details={
          deletingNote ? (
            <div className={`${styles.coursePreview} ${styles.summaryBox}`}>
              <strong className={styles.summaryName}>{deletingNote.title}</strong>
              <span>
                {courses.find((course) => course.id === deletingNote.courseId)?.name ?? '未分类'} ·{' '}
                {formatRelativeTime(deletingNote.updatedAt)}更新
              </span>
            </div>
          ) : null
        }
        onCancel={() => setDeletingNote(null)}
        onConfirm={() => {
          if (!deletingNote) return;
          void deleteNote(deletingNote.id).then(() => {
            toast.show({ message: `已删除「${deletingNote.title}」`, tone: 'info' });
            setDeletingNote(null);
          });
        }}
      />

      <ConfirmDialog
        open={deletingCourse !== null}
        title="删除课程？"
        description="只有课程下没有笔记时才能删除，删除后课程无法恢复。"
        icon={Trash2}
        confirmLabel="删除课程"
        details={
          deletingCourse ? (
            <div className={`${styles.coursePreview} ${styles.summaryBox}`}>
              <strong className={styles.summaryName}>{deletingCourse.name}</strong>
              <span>
                当前有 {notes.filter((note) => note.courseId === deletingCourse.id).length} 篇笔记
              </span>
              {courseError ? <span className={styles.summaryError}>{courseError}</span> : null}
            </div>
          ) : null
        }
        onCancel={() => {
          setDeletingCourse(null);
          setCourseError(null);
        }}
        onConfirm={() => {
          if (!deletingCourse) return;
          void deleteCourse(deletingCourse.id)
            .then(() => {
              toast.show(`已删除课程「${deletingCourse.name}」`);
              setDeletingCourse(null);
              setCourseError(null);
              setParams({});
            })
            .catch((cause: unknown) => {
              setCourseError(cause instanceof Error ? cause.message : '删除失败');
            });
        }}
      />
    </div>
  );
}
