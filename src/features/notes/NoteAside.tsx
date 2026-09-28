import type { Editor } from '@tiptap/react';
import { CalendarClock, ListChecks, Plus, Star, Tag as TagIcon, X } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLibrary } from '../../app/LibraryProvider';
import { ROUTES } from '../../app/routes';
import { formatDueLabel, formatRelativeTime } from '../../lib/format';
import { reviewStatus } from '../../lib/review';
import type { NoteSummary } from '../../lib/types';
import { Button, IconButton } from '../../components/ui/Button';
import { Tag } from '../../components/ui/Tag';
import { TextField } from '../../components/ui/Fields';
import { OutlinePanel } from './OutlinePanel';
import styles from './notes.module.css';

export interface NoteAsideProps {
  note: NoteSummary;
  editor: Editor | null;
  tags: string[];
  onTagsChange(tags: string[]): void;
}

/** 右侧辅助栏：大纲、标签、复习状态、关联练习题 */
export function NoteAside({ note, editor, tags, onTagsChange }: NoteAsideProps): ReactElement {
  const { noteReviewMap, reviews, exercises, toggleExercise, courses } = useLibrary();
  const navigate = useNavigate();
  const [addingTag, setAddingTag] = useState(false);
  const [tagDraft, setTagDraft] = useState('');

  const course = courses.find((item) => item.id === note.courseId);
  const review = noteReviewMap.get(note.id);
  const noteReviews = reviews
    .filter((item) => item.noteId === note.id)
    .sort((a, b) => {
      const left = a.dueAt ? new Date(a.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
      const right = b.dueAt ? new Date(b.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
      return left - right;
    });
  const noteExercises = exercises.filter((item) => item.noteId === note.id);

  const commitTag = (): void => {
    const value = tagDraft.trim().replace(/^#/, '');
    if (value && !tags.includes(value) && tags.length < 20) {
      onTagsChange([...tags, value]);
    }
    setTagDraft('');
    setAddingTag(false);
  };

  return (
    <aside className={styles.aside} aria-label="笔记辅助信息">
      <section className={styles.asideSection}>
        <h3 className={styles.asideTitle}>笔记大纲</h3>
        <OutlinePanel editor={editor} />
      </section>

      <section className={styles.asideSection}>
        <h3 className={styles.asideTitle}>
          <TagIcon size={12} aria-hidden />
          标签
        </h3>
        <div className={styles.asideTags}>
          {tags.map((tag) => (
            <Tag
              key={tag}
              tone="neutral"
              onRemove={() => onTagsChange(tags.filter((item) => item !== tag))}
            >
              {tag}
            </Tag>
          ))}
          {addingTag ? (
            <span className={styles.tagInputRow}>
              <TextField
                aria-label="新增标签"
                placeholder="例如：闭包"
                value={tagDraft}
                autoFocus
                onChange={(event) => setTagDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') commitTag();
                  if (event.key === 'Escape') {
                    setTagDraft('');
                    setAddingTag(false);
                  }
                }}
                onBlur={commitTag}
              />
              <IconButton icon={X} label="取消添加标签" size="sm" onClick={() => setAddingTag(false)} />
            </span>
          ) : (
            <button type="button" className={styles.addTag} onClick={() => setAddingTag(true)}>
              <Plus size={12} aria-hidden />
              添加标签
            </button>
          )}
        </div>
      </section>

      <section className={styles.asideSection}>
        <h3 className={styles.asideTitle}>
          <CalendarClock size={12} aria-hidden />
          复习状态
        </h3>
        <div className={styles.reviewBox}>
          <div className={styles.reviewHeadline}>
            <span className={styles.reviewStatusText} data-tone={review?.tone ?? 'none'}>
              {review?.label ?? '未安排复习'}
            </span>
            {review && review.count > 0 ? (
              <span className={styles.reviewCount}>{review.count} 个知识点</span>
            ) : null}
          </div>

          {noteReviews.length > 0 ? (
            <ul className={styles.reviewList} role="list">
              {noteReviews.slice(0, 3).map((item) => {
                const status = reviewStatus(item);
                return (
                  <li key={item.id} className={styles.reviewItem}>
                    <span className={styles.reviewItemTitle}>{item.title}</span>
                    <span className={styles.reviewItemMeta}>
                      {item.state === 'mastered' ? '已掌握' : formatDueLabel(item.dueAt).text}
                      {item.lastReviewedAt
                        ? ` · 上次 ${formatRelativeTime(item.lastReviewedAt)}`
                        : ''}
                      <span className={styles.reviewBadge} data-tone={status.tone}>
                        {status.label}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className={styles.asideHint}>
              还没有把这篇笔记里的知识点加入复习。复习页可以把任意一节标记成需要复习的内容。
            </p>
          )}

          <Button
            size="sm"
            variant="secondary"
            icon={CalendarClock}
            onClick={() => navigate(ROUTES.review)}
            style={{ width: '100%' }}
          >
            去复习页查看
          </Button>
        </div>
      </section>

      <section className={styles.asideSection}>
        <h3 className={styles.asideTitle}>
          <ListChecks size={12} aria-hidden />
          关联练习
        </h3>
        {noteExercises.length > 0 ? (
          <ul className={styles.exerciseList} role="list">
            {noteExercises.map((exercise) => (
              <li key={exercise.id} className={styles.exerciseItem}>
                <button
                  type="button"
                  className={styles.exerciseCheck}
                  aria-pressed={exercise.done}
                  aria-label={exercise.done ? '标记为未完成' : '标记为已完成'}
                  onClick={() => void toggleExercise(exercise.id, !exercise.done)}
                >
                  {exercise.done ? '✓' : ''}
                </button>
                <span className={styles.exerciseBody}>
                  <span className={styles.exerciseTitle} data-done={exercise.done || undefined}>
                    {exercise.title}
                  </span>
                  <span className={styles.exerciseMeta}>
                    {exercise.language === 'text' ? '纯文本' : exercise.language}
                    {exercise.done ? ' · 已完成' : ' · 待完成'}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.asideHint}>这篇笔记还没有关联练习题。</p>
        )}
        <Button
          size="sm"
          variant="ghost"
          icon={Plus}
          onClick={() => navigate(ROUTES.createWith('exercise', { note: note.id, course: note.courseId }))}
          style={{ width: '100%' }}
        >
          添加练习题
        </Button>
      </section>

      <section className={styles.asideSection}>
        <h3 className={styles.asideTitle}>笔记信息</h3>
        <dl className={styles.metaList}>
          <div>
            <dt>所属课程</dt>
            <dd>{course?.name ?? '未分类'}</dd>
          </div>
          <div>
            <dt>更新时间</dt>
            <dd>{formatRelativeTime(note.updatedAt)}</dd>
          </div>
          <div>
            <dt>收藏</dt>
            <dd>{note.favorite ? '已收藏' : '未收藏'}</dd>
          </div>
        </dl>
        {note.favorite ? (
          <span className={styles.favoriteHint}>
            <Star size={11} aria-hidden fill="currentColor" />
            已加入收藏，可在课程管理页快速筛选
          </span>
        ) : null}
      </section>
    </aside>
  );
}
