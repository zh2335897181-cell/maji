/* =============================================================================
   码迹 · 复习排期算法（纯函数）
   -----------------------------------------------------------------------------
   刻意保持简单、可解释：用户不需要理解算法，只需要知道“什么时候再来一次”。
   间隔序列对应 1 / 3 / 7 / 16 / 35 天，连续掌握 4 次后视为“已掌握”。
   ============================================================================= */

import type { ReviewAction, ReviewItem, ReviewState } from './types';

export const REVIEW_INTERVALS_DAYS = [1, 3, 7, 16, 35] as const;
/** 连续多少次“已掌握”后进入长期记忆，不再安排复习 */
export const MASTERED_AFTER = 4;
/** “再复习一次”之后多久再出现 */
export const REVIEW_AGAIN_MINUTES = 25;

function atHour(date: Date, hour: number): Date {
  const copy = new Date(date);
  copy.setHours(hour, 0, 0, 0);
  return copy;
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

/** 复习统一安排在当地时间早上 9:00，符合“每天开始学习时先复习”的习惯 */
export function scheduleAfterDays(days: number, now: Date = new Date()): string {
  return atHour(addDays(now, days), 9).toISOString();
}

export interface ReviewTransition {
  state: ReviewState;
  dueAt: string | null;
  reviewCount: number;
  masteredStreak: number;
  confidence: 'low' | 'medium' | 'high';
  lastReviewedAt: string;
}

/**
 * 计算一次复习操作之后的状态变化。
 * 三个动作的语义：
 *   mastered      —— 已掌握：拉长间隔，连续 4 次后归档为长期记忆
 *   review-again  —— 再复习一次：还没吃透，25 分钟后再来一遍
 *   remind-later  —— 稍后提醒：今天不看了，今晚 20:00 或明天早上再出现
 */
export function applyReviewAction(
  item: Pick<ReviewItem, 'reviewCount' | 'masteredStreak' | 'state'>,
  action: ReviewAction,
  now: Date = new Date(),
): ReviewTransition {
  const nowIso = now.toISOString();

  if (action === 'mastered') {
    const reviewCount = item.reviewCount + 1;
    const masteredStreak = item.masteredStreak + 1;
    if (masteredStreak >= MASTERED_AFTER) {
      return { state: 'mastered', dueAt: null, reviewCount, masteredStreak, confidence: 'high', lastReviewedAt: nowIso };
    }
    // 连续掌握后进入 1 天间隔，之后依次拉长到 3 / 7 / 16 / 35 天
    const index = Math.min(masteredStreak - 1, REVIEW_INTERVALS_DAYS.length - 1);
    return {
      state: 'scheduled',
      dueAt: scheduleAfterDays(REVIEW_INTERVALS_DAYS[index] ?? 1, now),
      reviewCount,
      masteredStreak,
      confidence: 'high',
      lastReviewedAt: nowIso,
    };
  }

  if (action === 'review-again') {
    const later = new Date(now.getTime() + REVIEW_AGAIN_MINUTES * 60 * 1000);
    return {
      state: 'scheduled',
      dueAt: later.toISOString(),
      reviewCount: item.reviewCount + 1,
      masteredStreak: 0,
      confidence: 'low',
      lastReviewedAt: nowIso,
    };
  }

  // remind-later：当天 20:00 之前还有时间就今晚再看，否则推到明天早上
  const tonight = atHour(now, 20);
  const dueAt =
    tonight.getTime() > now.getTime() + 60 * 60 * 1000
      ? tonight.toISOString()
      : scheduleAfterDays(1, now);

  return {
    state: 'scheduled',
    dueAt,
    reviewCount: item.reviewCount,
    masteredStreak: 0,
    confidence: 'medium',
    lastReviewedAt: nowIso,
  };
}

/** 操作之后给用户的轻量反馈文案 */
export function reviewFeedback(action: ReviewAction, title: string, now: Date = new Date()): string {
  if (action === 'mastered') return `「${title}」已标记为掌握`;
  if (action === 'review-again') return `「${title}」将在 ${REVIEW_AGAIN_MINUTES} 分钟后再出现`;
  const tonight = atHour(now, 20);
  if (tonight.getTime() > now.getTime() + 60 * 60 * 1000) return `「${title}」今晚 20:00 再提醒`;
  return `「${title}」明天早上再提醒`;
}

export function isDueNow(item: Pick<ReviewItem, 'state' | 'dueAt'>, now: Date = new Date()): boolean {
  if (item.state === 'mastered' || item.state === 'archived') return false;
  if (!item.dueAt) return item.state === 'due';
  return new Date(item.dueAt).getTime() <= now.getTime();
}

export interface ReviewBuckets<T> {
  /** 今天必须复习（含逾期） */
  due: T[];
  /** 未来 7 天 */
  upcoming: T[];
  /** 已掌握 */
  mastered: T[];
}

/** 复习页的分组：逾期排在最前，其次按时间升序 */
export function groupReviewItems<T extends Pick<ReviewItem, 'state' | 'dueAt'>>(
  items: T[],
  now: Date = new Date(),
): ReviewBuckets<T> {
  const due: T[] = [];
  const upcoming: T[] = [];
  const mastered: T[] = [];
  const weekLater = now.getTime() + 7 * 24 * 60 * 60 * 1000;

  for (const item of items) {
    if (item.state === 'mastered' || item.state === 'archived') {
      mastered.push(item);
      continue;
    }
    if (isDueNow(item, now)) {
      due.push(item);
      continue;
    }
    if (item.dueAt && new Date(item.dueAt).getTime() <= weekLater) {
      upcoming.push(item);
      continue;
    }
    upcoming.push(item);
  }

  const byDueAt = (a: T, b: T): number => {
    const left = a.dueAt ? new Date(a.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
    const right = b.dueAt ? new Date(b.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
    return left - right;
  };

  due.sort(byDueAt);
  upcoming.sort(byDueAt);
  return { due, upcoming, mastered };
}

export type ReviewStatusTone = 'due' | 'soon' | 'mastered' | 'later';

export interface ReviewStatus {
  label: string;
  tone: ReviewStatusTone;
}

/** 列表行上的复习状态标签 */
export function reviewStatus(item: Pick<ReviewItem, 'state' | 'dueAt'>, now: Date = new Date()): ReviewStatus {
  if (item.state === 'mastered') return { label: '已掌握', tone: 'mastered' };
  if (item.state === 'archived') return { label: '已归档', tone: 'later' };
  if (isDueNow(item, now)) return { label: '待复习', tone: 'due' };
  if (!item.dueAt) return { label: '未排期', tone: 'later' };

  const days = Math.round(
    (new Date(item.dueAt).getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
  );
  if (days <= 3) return { label: '即将复习', tone: 'soon' };
  return { label: '已排期', tone: 'later' };
}
