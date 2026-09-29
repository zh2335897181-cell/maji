import { useMemo, type ReactElement } from 'react';
import { ArrowLeft, Clock, Play, SquareArrowOutUpRight } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import type { ReviewSessionSummary } from '../../lib/types';
import { formatReviewDuration, getActiveSecondsByLocalDay } from './reviewSession';
import styles from './review.module.css';

export function ReviewSessionHistory({ sessions, onBack, onOpen }: { sessions: ReviewSessionSummary[]; onBack(): void; onOpen(id: string): void }): ReactElement {
  const days = useMemo(() => {
    const byDate = new Map<string, { seconds: number; sessions: ReviewSessionSummary[] }>();
    for (const session of sessions) {
      const heartbeatAt = Date.parse(session.updatedAt);
      const asOf = session.status === 'in-progress' && Number.isFinite(heartbeatAt)
        ? new Date(Math.min(Date.now(), heartbeatAt))
        : new Date();
      const timeByDate = getActiveSecondsByLocalDay(session.activeSegments, session.activeSegmentStartedAt, asOf);
      for (const [date, seconds] of timeByDate) {
        const value = byDate.get(date) ?? { seconds: 0, sessions: [] };
        value.seconds += seconds;
        value.sessions.push(session);
        byDate.set(date, value);
      }
    }
    return [...byDate.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([date, data]) => ({ date, ...data }));
  }, [sessions]);

  return <section className={styles.sessionPage}>
    <header className={styles.runnerTop}><Button variant="ghost" icon={ArrowLeft} onClick={onBack}>返回复习</Button><div><h2>AI 练习记录</h2><p className={styles.runnerMeta}>按本地日期统计活跃学习时间，暂停时段不会计入。</p></div></header>
    {days.length === 0 ? <div className={styles.runnerCard}><Clock size={22} /><strong>还没有 AI 练习记录</strong><span>完成一次练习后，会在这里看到每天复习的时间、内容和掌握情况。</span></div> : days.map(({ date, seconds, sessions: daySessions }) => <article className={styles.historyDay} key={date}>
      <header className={styles.runnerTop}><h3>{date}</h3><strong>{formatReviewDuration(seconds)}</strong></header>
      {daySessions.map((session) => <div className={styles.historyRow} key={`${date}-${session.id}`}>
        <div><strong>{session.sources.map((source) => source.noteTitle).join('、') || '练习记录'}</strong><span>{depthLabel(session.depth)} · {session.questionCount} 题 · {session.averageScore === null ? '尚未评分' : `平均 ${Math.round(session.averageScore)} 分`} · {statusLabel(session.status)}</span></div>
        <Button variant="secondary" icon={session.status === 'in-progress' ? Play : SquareArrowOutUpRight} onClick={() => onOpen(session.id)}>{session.status === 'in-progress' ? '继续练习' : '查看详情'}</Button>
      </div>)}
    </article>)}
  </section>;
}

function depthLabel(depth: ReviewSessionSummary['depth']): string { return ({ quick: '快速', standard: '标准', deep: '深入' })[depth]; }
function statusLabel(status: ReviewSessionSummary['status']): string { return status === 'completed' ? '已完成' : '进行中'; }
