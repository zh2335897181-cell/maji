import {
  ArrowUpRight,
  CircleCheck,
  Clock,
  RotateCcw,
  Sparkles,
  Target,
  History,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useLibrary } from '../../app/LibraryProvider';
import { ROUTES } from '../../app/routes';
import { useToast } from '../../app/ToastProvider';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Tag } from '../../components/ui/Tag';
import page from '../../components/layout/page.module.css';
import { formatDueLabel, formatRelativeTime } from '../../lib/format';
import { groupReviewItems, reviewFeedback } from '../../lib/review';
import { languageName } from '../../lib/languages';
import type { ReviewAction, ReviewItemWithNote, ReviewSessionWithQuestions } from '../../lib/types';
import { ReviewSessionSetup } from './ReviewSessionSetup';
import { ReviewSessionRunner } from './ReviewSessionRunner';
import { ReviewSessionHistory } from './ReviewSessionHistory';
import styles from './review.module.css';
import { mindMapApi } from '../mindmap/repository';
import { mindMapReviewPreset, type MindMapReviewPreset } from '../mindmap/reviewPreset';

type Tab = 'due' | 'upcoming' | 'mastered';

/** 复习页：只呈现知识点本身与三个动作，避免复杂仪表盘 */
export function ReviewPage(): ReactElement {
  const { reviews, applyReviewAction, notes, courses, reviewSessions, loadNote, createReviewSession, getReviewSession } = useLibrary();
  const toast = useToast();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('due');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [view, setView] = useState<'queue' | 'setup' | 'history' | 'runner'>('queue');
  const [activeSession, setActiveSession] = useState<ReviewSessionWithQuestions | null>(null);
  const [params] = useSearchParams();
  const [preset, setPreset] = useState<MindMapReviewPreset | null>(null);
  useEffect(() => {
    const mapId = params.get('map'), nodeId = params.get('node'); if (!mapId || !nodeId) return;
    let active = true;
    void mindMapApi().list().then(maps => { if (!active) return; const map = maps.find(m => m.id === mapId); if (!map) throw new Error('导图已删除'); setPreset(mindMapReviewPreset(map, nodeId, notes)); setView('setup'); }).catch(cause => { if (active) toast.show({ message: cause instanceof Error ? cause.message : '读取导图失败', tone: 'error' }); });
    return () => { active = false; };
  }, [params]);

  const openSession = async (id: string): Promise<void> => {
    const loaded = await getReviewSession(id);
    if (loaded) { setActiveSession(loaded); setView('runner'); }
  };

  const buckets = useMemo(() => groupReviewItems(reviews), [reviews]);
  const list: ReviewItemWithNote[] =
    tab === 'due' ? buckets.due : tab === 'upcoming' ? buckets.upcoming : buckets.mastered;

  const handleAction = async (item: ReviewItemWithNote, action: ReviewAction): Promise<void> => {
    setBusyId(item.id);
    try {
      await applyReviewAction(item.id, action);
      toast.show({
        message: reviewFeedback(action, item.title),
        tone: action === 'mastered' ? 'success' : 'info',
        action: {
          label: '查看笔记',
          onClick: () => navigate(ROUTES.note(item.noteId)),
        },
      });
    } catch (cause) {
      toast.show({
        message: cause instanceof Error ? cause.message : '更新复习状态失败',
        tone: 'error',
      });
    } finally {
      setBusyId(null);
    }
  };

  const tabs: Array<{ id: Tab; label: string; count: number }> = [
    { id: 'due', label: '今天待复习', count: buckets.due.length },
    { id: 'upcoming', label: '即将到期', count: buckets.upcoming.length },
    { id: 'mastered', label: '已掌握', count: buckets.mastered.length },
  ];

  if (view === 'setup') return <div className={page.page} data-scroll-container><div className={page.inner}><ReviewSessionSetup preset={preset} notes={notes} courses={courses} reviews={reviews} loadNote={loadNote} onBack={() => { setPreset(null); setView('queue'); }} onCreate={createReviewSession} onStarted={(session) => { setActiveSession(session); setView('runner'); }} /></div></div>;
  if (view === 'history') return <div className={page.page} data-scroll-container><div className={page.inner}><ReviewSessionHistory sessions={reviewSessions} onBack={() => setView('queue')} onOpen={(id) => void openSession(id)} /></div></div>;
  if (view === 'runner' && activeSession) return <div className={page.page} data-scroll-container><div className={page.inner}><ReviewSessionRunner key={activeSession.id} session={activeSession} onBack={() => setView('queue')} /></div></div>;

  return (
    <div className={page.page} data-scroll-container>
      <div className={page.inner}>
        <header className={page.pageHeader}>
          <div className={page.pageHeading}>
            <h1 className={page.pageTitle}>复习</h1>
            <p className={page.pageSubtitle}>
              复习时只看知识点本身，想不起来再打开原笔记。掌握程度会决定下一次出现的时间。
            </p>
          </div>
          <div className={page.pageActions}>
            <Button variant="secondary" icon={History} onClick={() => setView('history')}>练习记录</Button>
            <Button variant="primary" icon={Sparkles} onClick={() => setView('setup')}>AI 每日练习</Button>
            <Tag tone="accent" icon={Target}>
              今天 {buckets.due.length} 项
            </Tag>
          </div>
        </header>

        {reviewSessions.some((session) => session.status === 'in-progress') ? <div className={styles.sessionNotice}>
          <span>你有未完成的 AI 练习，继续后会从上次进度恢复。</span>
          <Button variant="secondary" onClick={() => { const session = reviewSessions.find((item) => item.status === 'in-progress'); if (session) void openSession(session.id); }}>继续练习</Button>
        </div> : null}

        <div className={styles.tabs} role="tablist" aria-label="复习分组">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className={styles.tab}
              onClick={() => setTab(item.id)}
            >
              {item.label}
              <span className={styles.tabCount}>{item.count}</span>
            </button>
          ))}
        </div>

        {list.length === 0 ? (
          tab === 'due' ? (
            <EmptyState
              icon={CircleCheck}
              title="今天没有待复习的内容"
              description="所有到期的知识点都复习完了。新的复习任务会在到期当天出现在这里。"
              actions={
                <Button variant="secondary" onClick={() => setTab('upcoming')}>
                  看看即将到期的知识点
                </Button>
              }
            />
          ) : tab === 'upcoming' ? (
            <EmptyState
              icon={Clock}
              title="最近 7 天没有安排复习"
              description="在笔记里标记需要复习的知识点后，它们会按 1 / 3 / 7 / 16 / 35 天的节奏出现。"
            />
          ) : (
            <EmptyState
              icon={Sparkles}
              title="还没有已掌握的知识点"
              description="连续 4 次标记为「已掌握」后，知识点会进入长期记忆，不再安排复习。"
            />
          )
        ) : tab === 'mastered' ? (
          <div className={page.panel}>
            <ul className={styles.masteredList} role="list">
              {list.map((item) => (
                <li className={styles.masteredRow} key={item.id}>
                  <CircleCheck size={15} aria-hidden style={{ color: 'var(--success-500)' }} />
                  <span className={styles.masteredMain}>
                    <span className={styles.masteredTitle}>{item.title}</span>
                    <span className={styles.masteredMeta}>
                      {item.courseName} · 复习 {item.reviewCount} 次
                      {item.lastReviewedAt
                        ? ` · 最近一次 ${formatRelativeTime(item.lastReviewedAt)}`
                        : ''}
                    </span>
                  </span>
                  <Link className={styles.noteLink} to={ROUTES.note(item.noteId)}>
                    原笔记
                    <ArrowUpRight size={12} aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className={styles.queue}>
            {list.map((item) => {
              const due = formatDueLabel(item.dueAt);
              const note = notes.find((candidate) => candidate.id === item.noteId);
              return (
                <article
                  className={styles.card}
                  key={item.id}
                  data-state={due.tone === 'overdue' ? 'overdue' : 'normal'}
                >
                  <div className={styles.cardTop}>
                    <div className={styles.cardTitles}>
                      <h2 className={styles.cardTitle}>{item.title}</h2>
                      <div className={styles.cardMeta}>
                        <span>{item.courseName}</span>
                        <span aria-hidden>·</span>
                        <span>{note?.title ?? item.noteTitle}</span>
                        {note ? (
                          <>
                            <span aria-hidden>·</span>
                            <Tag mono>{languageName(note.language)}</Tag>
                          </>
                        ) : null}
                      </div>
                    </div>
                    <span className={styles.dueTag} data-tone={due.tone}>
                      {due.text}
                    </span>
                  </div>

                  <p className={styles.prompt}>{item.summary}</p>

                  <div className={styles.actions}>
                    <Button
                      variant="primary"
                      icon={CircleCheck}
                      loading={busyId === item.id}
                      onClick={() => void handleAction(item, 'mastered')}
                    >
                      已掌握
                    </Button>
                    <Button
                      variant="secondary"
                      icon={RotateCcw}
                      disabled={busyId === item.id}
                      onClick={() => void handleAction(item, 'review-again')}
                    >
                      再复习一次
                    </Button>
                    <Button
                      variant="ghost"
                      icon={Clock}
                      disabled={busyId === item.id}
                      onClick={() => void handleAction(item, 'remind-later')}
                    >
                      稍后提醒
                    </Button>

                    <span className={styles.actionsSpacer} />

                    <Link className={styles.noteLink} to={ROUTES.note(item.noteId)}>
                      打开原笔记
                      <ArrowUpRight size={12} aria-hidden />
                    </Link>
                  </div>

                  <span className={styles.history}>
                    共复习 {item.reviewCount} 次
                    {item.lastReviewedAt
                      ? ` · 最近一次 ${formatRelativeTime(item.lastReviewedAt)}`
                      : ' · 还没有复习记录'}
                    {item.confidence ? ` · 上次自评：${{ low: '还不熟', medium: '一般', high: '熟练' }[item.confidence]}` : ''}
                  </span>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
