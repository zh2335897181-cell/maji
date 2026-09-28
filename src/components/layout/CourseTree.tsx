import clsx from 'clsx';
import { ChevronDown, ChevronRight, FileText, Plus, Star } from 'lucide-react';
import { useEffect, useState, type ReactElement } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useLibrary } from '../../app/LibraryProvider';
import { ROUTES } from '../../app/routes';
import type { NoteSummary } from '../../lib/types';
import { courseColorVar } from '../../lib/icons';
import { StatusDot } from '../ui/Tag';
import styles from './AppSidebar.module.css';

const NOTES_PER_COURSE = 12;

/** 折叠态：只显示课程色块，鼠标悬停显示课程名 */
export function RailCourseList(): ReactElement {
  const { courses, notes } = useLibrary();
  const location = useLocation();
  const activeCourseId = new URLSearchParams(location.search).get('course');

  return (
    <div className={styles.railCourses}>
      {courses.map((course) => {
        const count = notes.filter((note) => note.courseId === course.id).length;
        return (
          <NavLink
            key={course.id}
            to={ROUTES.coursesWith({ courseId: course.id })}
            title={`${course.name}（${count} 篇笔记）`}
            aria-label={`${course.name}，${count} 篇笔记`}
            className={clsx(styles.railCourse, activeCourseId === course.id && styles.railCourseActive)}
          >
            <span
              className={styles.courseDot}
              style={{ background: courseColorVar(course.colorKey) }}
              aria-hidden
            />
          </NavLink>
        );
      })}
    </div>
  );
}

interface CourseGroupProps {
  courseId: string;
  courseName: string;
  colorKey: string;
  notes: NoteSummary[];
  expanded: boolean;
  activeNoteId: string | null;
  onToggle(): void;
}

function CourseGroup({
  courseId,
  courseName,
  colorKey,
  notes,
  expanded,
  activeNoteId,
  onToggle,
}: CourseGroupProps): ReactElement {
  const { noteReviewMap } = useLibrary();
  const navigate = useNavigate();

  return (
    <div>
      <button
        type="button"
        className={clsx(styles.courseRow, expanded && styles.courseRowActive)}
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={`course-${courseId}-notes`}
      >
        <span className={styles.courseChevron} aria-hidden>
          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </span>
        <span
          className={styles.courseDot}
          style={{ background: courseColorVar(colorKey) }}
          aria-hidden
        />
        <span className={styles.courseName}>{courseName}</span>
        <span className={styles.courseCount}>{notes.length}</span>
      </button>

      {expanded ? (
        <div className={styles.noteList} id={`course-${courseId}-notes`}>
          {notes.slice(0, NOTES_PER_COURSE).map((note) => {
            const review = noteReviewMap.get(note.id);
            return (
              <NavLink
                key={note.id}
                to={ROUTES.note(note.id)}
                title={note.title}
                className={clsx(styles.noteRow, activeNoteId === note.id && styles.noteRowActive)}
              >
                <FileText size={13} aria-hidden className={styles.navIcon} />
                <span className={styles.noteTitle}>{note.title}</span>
                {note.favorite ? (
                  <Star size={11} aria-hidden className={styles.noteFlag} fill="currentColor" />
                ) : review && review.tone !== 'none' && review.tone !== 'mastered' ? (
                  <StatusDot tone={review.tone} />
                ) : null}
              </NavLink>
            );
          })}
          {notes.length > NOTES_PER_COURSE ? (
            <button
              type="button"
              className={styles.treeAction}
              onClick={() => navigate(ROUTES.coursesWith({ courseId }))}
            >
              还有 {notes.length - NOTES_PER_COURSE} 篇，查看全部
            </button>
          ) : null}
          {notes.length === 0 ? <span className={styles.emptyHint}>这门课程还没有笔记</span> : null}
          <button
            type="button"
            className={styles.treeAction}
            onClick={() => navigate(ROUTES.createWith('note', { course: courseId }))}
          >
            <Plus size={13} aria-hidden />
            新建笔记
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** 课程目录：点击课程展开/收起它的笔记 */
export function CourseTree(): ReactElement {
  const { courses, notes, loading } = useLibrary();
  const location = useLocation();
  const activeNoteId = location.pathname.startsWith('/notes/') ? location.pathname.slice(7) : null;
  const activeNote = notes.find((note) => note.id === activeNoteId);
  const [expanded, setExpanded] = useState<string[]>([]);

  // 打开笔记时自动展开它所属的课程
  useEffect(() => {
    if (activeNote && !expanded.includes(activeNote.courseId)) {
      setExpanded((current) => [...current, activeNote.courseId]);
    }
  }, [activeNote, expanded]);

  if (loading) {
    return <span className={styles.emptyHint}>正在读取课程…</span>;
  }

  if (courses.length === 0) {
    return (
      <span className={styles.emptyHint}>
        还没有课程。点击下方「新建内容」创建第一门课程，再开始记笔记。
      </span>
    );
  }

  return (
    <>
      {courses.map((course) => (
        <CourseGroup
          key={course.id}
          courseId={course.id}
          courseName={course.name}
          colorKey={course.colorKey}
          notes={notes.filter((note) => note.courseId === course.id)}
          expanded={expanded.includes(course.id)}
          activeNoteId={activeNoteId}
          onToggle={() =>
            setExpanded((current) =>
              current.includes(course.id)
                ? current.filter((id) => id !== course.id)
                : [...current, course.id],
            )
          }
        />
      ))}
    </>
  );
}
