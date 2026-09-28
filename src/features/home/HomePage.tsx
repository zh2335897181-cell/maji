import {
  ChevronRight,
  Clock,
  Code,
  FileText,
  ListChecks,
  Plus,
  RotateCcw,
  BookPlus,
  Star,
} from 'lucide-react';
import type { ReactElement } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLibrary } from '../../app/LibraryProvider';
import { ROUTES } from '../../app/routes';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Tag } from '../../components/ui/Tag';
import page from '../../components/layout/page.module.css';
import { courseColorVar } from '../../lib/icons';
import { formatDueLabel, formatGreeting, formatRelativeTime, formatTodayHeading } from '../../lib/format';
import { isDueNow } from '../../lib/review';
import { languageName } from '../../lib/languages';
import styles from './home.module.css';

const QUICK_ACTIONS = [
  {
    kind: 'note',
    icon: FileText,
    label: '新建笔记',
    hint: '记录一节课的知识点',
  },
  {
    kind: 'snippet',
    icon: Code,
    label: '记录代码片段',
    hint: '保存可复用的代码与运行结果',
  },
  {
    kind: 'exercise',
    icon: ListChecks,
    label: '添加练习题',
    hint: '把课堂练习挂到笔记上',
  },
  {
    kind: 'course',
    icon: BookPlus,
    label: '新建课程',
    hint: '按课程整理笔记',
  },
] as const;

/** 学习首页：继续学习、今天的复习、近期记录、快速新建 */
export function HomePage(): ReactElement {
  const { notes, courses, reviews, loading } = useLibrary();
  const navigate = useNavigate();

  const recent = [...notes]
    .filter((note) => note.lastOpenedAt)
    .sort(
      (a, b) =>
        new Date(b.lastOpenedAt ?? 0).getTime() - new Date(a.lastOpenedAt ?? 0).getTime(),
    );

  const latest = recent[0] ?? null;
  const latestCourse = courses.find((course) => course.id === latest?.courseId);
  const recentRest = recent.slice(1, 5);
  const dueToday = reviews.filter((item) => isDueNow(item));
  const reviewedToday = reviews.filter(
    (item) =>
      item.lastReviewedAt &&
      new Date(item.lastReviewedAt).toDateString() === new Date().toDateString(),
  ).length;
  const favoriteCount = notes.filter((note) => note.favorite).length;

  if (loading) {
    return (
      <div className={page.page}>
        <div className={page.inner}>
          <p className={page.pageSubtitle}>正在读取本地数据…</p>
        </div>
      </div>
    );
  }

  // 新用户：还没有任何课程或笔记
  if (courses.length === 0 && notes.length === 0) {
    return (
      <div className={page.page}>
        <div className={page.inner}>
          <EmptyState
            icon={BookPlus}
            title="欢迎使用码迹"
            description="先创建一门课程（例如「Python 入门」），再往里记录笔记。所有内容都保存在你自己的电脑上。"
            actions={
              <>
                <Button
                  variant="primary"
                  icon={Plus}
                  onClick={() => navigate(ROUTES.createWith('course'))}
                >
                  创建第一门课程
                </Button>
                <Button variant="secondary" onClick={() => navigate(ROUTES.createWith('note'))}>
                  直接写一篇笔记
                </Button>
              </>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className={page.page} data-scroll-container>
      <div className={`${page.inner} ${styles.homeInner}`}>
        <header className={page.pageHeader}>
          <div className={styles.greeting}>
            <span className={styles.greetingLine}>{formatGreeting()}，小林</span>
            <span className={styles.greetingMeta}>
              {formatTodayHeading()} · 共 {notes.length} 篇笔记
              {favoriteCount > 0 ? ` · ${favoriteCount} 篇收藏` : ''}
            </span>
          </div>
          <div className={page.pageActions}>
            <Button variant="primary" icon={Plus} onClick={() => navigate(ROUTES.createWith('note'))}>
              新建笔记
            </Button>
          </div>
        </header>

        <div className={`${page.columns} ${styles.homeColumns}`}>
          <div>
            <section className={page.section}>
              <div className={page.sectionHead}>
                <h2 className={page.sectionTitle}>继续学习</h2>
                {latest ? (
                  <Link className={page.sectionAction} to={ROUTES.note(latest.id)}>
                    打开笔记 →
                  </Link>
                ) : null}
              </div>

              {latest ? (
                <article className={styles.continueCard}>
                  <div className={styles.continueTop}>
                    <span
                      className={styles.courseChip}
                      style={{
                        background: courseColorVar(latestCourse?.colorKey ?? 'slate', 'bg'),
                        color: courseColorVar(latestCourse?.colorKey ?? 'slate', 'fg'),
                      }}
                    >
                      {latestCourse?.name ?? '未分类'}
                    </span>
                    <Tag mono>{languageName(latest.language)}</Tag>
                    {latest.favorite ? (
                      <Star size={13} aria-label="已收藏" style={{ color: 'var(--warning-500)' }} fill="currentColor" />
                    ) : null}
                  </div>

                  <Link className={styles.continueTitle} to={ROUTES.note(latest.id)}>
                    {latest.title}
                  </Link>
                  <p className={styles.continueExcerpt}>{latest.excerpt || '这篇笔记还没有正文内容。'}</p>

                  <div className={styles.continueMeta}>
                    <span>{formatRelativeTime(latest.lastOpenedAt ?? latest.updatedAt)}打开</span>
                    <span aria-hidden>·</span>
                    <span>{latestCourse?.description ?? '未填写课程说明'}</span>
                  </div>

                  <div className={styles.continueFooter}>
                    <Button
                      variant="primary"
                      icon={ChevronRight}
                      onClick={() => navigate(ROUTES.note(latest.id))}
                    >
                      继续编辑
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => navigate(ROUTES.coursesWith({ courseId: latest.courseId }))}
                    >
                      查看该课程
                    </Button>
                  </div>
                </article>
              ) : (
                <div className={page.panelDashed}>
                  <EmptyState
                    icon={FileText}
                    compact
                    title="还没有打开过笔记"
                    description="左侧课程目录里选择一篇笔记，或新建一篇开始记录。"
                    actions={
                      <Button variant="secondary" onClick={() => navigate(ROUTES.createWith('note'))}>
                        新建笔记
                      </Button>
                    }
                  />
                </div>
              )}
            </section>

            <section className={page.section}>
              <div className={page.sectionHead}>
                <h2 className={page.sectionTitle}>
                  <Clock size={15} aria-hidden />
                  近期学习记录
                  <span className={page.sectionCount}>{recentRest.length} 篇</span>
                </h2>
                <Link className={page.sectionAction} to={ROUTES.courses}>
                  全部笔记 →
                </Link>
              </div>

              {recentRest.length > 0 ? (
                <div className={page.panel}>
                  {recentRest.map((note) => {
                    const course = courses.find((item) => item.id === note.courseId);
                    return (
                      <Link key={note.id} className={styles.recentRow} to={ROUTES.note(note.id)}>
                        <span
                          className={styles.recentDot}
                          style={{ background: courseColorVar(course?.colorKey ?? 'slate') }}
                          aria-hidden
                        />
                        <span className={styles.recentMain}>
                          <span className={styles.recentTitle}>{note.title}</span>
                          <span className={styles.recentMeta}>
                            {course?.name ?? '未分类'} · {formatRelativeTime(note.updatedAt)}更新
                          </span>
                        </span>
                        <ChevronRight size={14} aria-hidden style={{ color: 'var(--text-faint)' }} />
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <p className={page.pageSubtitle}>还没有其他的学习记录。</p>
              )}
            </section>
          </div>

          <div>
            <section className={page.section}>
              <div className={page.sectionHead}>
                <h2 className={page.sectionTitle}>
                  <RotateCcw size={15} aria-hidden />
                  今天的复习
                  <span className={page.sectionCount}>{dueToday.length} 项</span>
                </h2>
                <Link className={page.sectionAction} to={ROUTES.review}>
                  去复习 →
                </Link>
              </div>

              {dueToday.length > 0 ? (
                <div className={page.panel}>
                  <div className={styles.reviewProgress} aria-label={`今日已处理 ${reviewedToday} 项，待复习 ${dueToday.length} 项`}>
                    <span>今日复习进度</span>
                    <strong>{reviewedToday}<span> 项已处理</span></strong>
                  </div>
                  {dueToday.slice(0, 4).map((item) => {
                    const due = formatDueLabel(item.dueAt);
                    return (
                      <div className={styles.reviewRow} key={item.id}>
                        <span className={styles.reviewMain}>
                          <span className={styles.reviewTitle}>{item.title}</span>
                          <span className={styles.reviewMeta}>
                            {item.courseName}
                            <span aria-hidden>·</span>
                            <Link to={ROUTES.note(item.noteId)} style={{ color: 'var(--accent)' }}>
                              {item.noteTitle}
                            </Link>
                          </span>
                        </span>
                        <span className={styles.reviewDue} data-tone={due.tone}>
                          {due.text}
                        </span>
                      </div>
                    );
                  })}
                  <div className={styles.reviewRow}>
                    <Button
                      variant="secondary"
                      icon={RotateCcw}
                      onClick={() => navigate(ROUTES.review)}
                      style={{ width: '100%' }}
                    >
                      开始复习
                    </Button>
                  </div>
                </div>
              ) : (
                <div className={page.panelDashed}>
                  <EmptyState
                    icon={RotateCcw}
                    compact
                    title="今天没有待复习的内容"
                    description="复习任务会在到期当天出现在这里。"
                  />
                </div>
              )}
            </section>

            <section className={page.section}>
              <div className={page.sectionHead}>
                <h2 className={page.sectionTitle}>快速新建</h2>
              </div>
              <div className={styles.quickGrid}>
                {QUICK_ACTIONS.map((action) => (
                  <button
                    key={action.kind}
                    type="button"
                    className={styles.quickAction}
                    onClick={() => navigate(ROUTES.createWith(action.kind))}
                  >
                    <span className={styles.quickIcon}>
                      <action.icon size={15} aria-hidden />
                    </span>
                    <span className={styles.quickCopy}>
                      <span className={styles.quickLabel}>{action.label}</span>
                      <span className={styles.quickHint}>{action.hint}</span>
                    </span>
                    <ChevronRight className={styles.quickArrow} size={15} aria-hidden />
                  </button>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
