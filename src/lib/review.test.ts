import { describe, expect, it } from 'vitest';
import {
  MASTERED_AFTER,
  REVIEW_AGAIN_MINUTES,
  applyReviewAction,
  groupReviewItems,
  isDueNow,
  reviewFeedback,
  reviewStatus,
  scheduleAfterDays,
} from './review';
import type { ReviewItem } from './types';

const now = new Date('2025-03-04T15:30:00');

function item(overrides: Partial<ReviewItem> = {}): ReviewItem {
  return {
    id: 'review_x',
    title: '形参与实参',
    summary: '定义里的 name 是形参。',
    noteId: 'note_func_args',
    courseId: 'course_python',
    state: 'due',
    dueAt: '2025-03-04T09:00:00.000Z',
    lastReviewedAt: null,
    reviewCount: 0,
    masteredStreak: 0,
    confidence: null,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('复习排期', () => {
  it('复习时间统一安排在当地早上 9 点', () => {
    const due = new Date(scheduleAfterDays(3, now));
    expect(due.getHours()).toBe(9);
    expect(due.getMinutes()).toBe(0);
    expect(due.getDate()).toBe(7);
  });

  it('「已掌握」逐步拉长间隔', () => {
    const first = applyReviewAction({ reviewCount: 0, masteredStreak: 0, state: 'due' }, 'mastered', now);
    expect(first.state).toBe('scheduled');
    expect(new Date(first.dueAt as string).getDate()).toBe(5); // 1 天后

    const second = applyReviewAction({ reviewCount: 1, masteredStreak: 1, state: 'due' }, 'mastered', now);
    expect(new Date(second.dueAt as string).getDate()).toBe(7); // 3 天后

    const third = applyReviewAction({ reviewCount: 2, masteredStreak: 2, state: 'due' }, 'mastered', now);
    expect(new Date(third.dueAt as string).getDate()).toBe(11); // 7 天后
  });

  it(`连续 ${MASTERED_AFTER} 次掌握后进入长期记忆`, () => {
    const transition = applyReviewAction(
      { reviewCount: MASTERED_AFTER - 1, masteredStreak: MASTERED_AFTER - 1, state: 'due' },
      'mastered',
      now,
    );
    expect(transition.state).toBe('mastered');
    expect(transition.dueAt).toBeNull();
    expect(transition.confidence).toBe('high');
  });

  it('「再复习一次」把知识点排到 25 分钟后', () => {
    const transition = applyReviewAction({ reviewCount: 2, masteredStreak: 2, state: 'due' }, 'review-again', now);
    const due = new Date(transition.dueAt as string);
    expect(due.getTime() - now.getTime()).toBe(REVIEW_AGAIN_MINUTES * 60 * 1000);
    expect(transition.state).toBe('scheduled');
    expect(transition.confidence).toBe('low');
    expect(transition.reviewCount).toBe(3);
    expect(transition.masteredStreak).toBe(0);
  });

  it('「稍后提醒」在当天 20:00 与次日上午之间选择', () => {
    const afternoon = applyReviewAction({ reviewCount: 0, masteredStreak: 1, state: 'due' }, 'remind-later', now);
    expect(new Date(afternoon.dueAt as string).getHours()).toBe(20);
    expect(new Date(afternoon.dueAt as string).getDate()).toBe(4);

    const evening = applyReviewAction(
      { reviewCount: 0, masteredStreak: 1, state: 'due' },
      'remind-later',
      new Date('2025-03-04T19:40:00'),
    );
    const due = new Date(evening.dueAt as string);
    expect(due.getDate()).toBe(5);
    expect(due.getHours()).toBe(9);
  });

  it('连续掌握次数不会把之前的「再复习一次」算进去', () => {
    const retry = applyReviewAction({ reviewCount: 3, masteredStreak: 0, state: 'due' }, 'review-again', now);
    const firstMastery = applyReviewAction(retry, 'mastered', now);
    expect(firstMastery.state).toBe('scheduled');
    expect(firstMastery.masteredStreak).toBe(1);
    expect(new Date(firstMastery.dueAt as string).getDate()).toBe(5);
  });

  it('操作反馈文案说明下一步会发生什么', () => {
    expect(reviewFeedback('mastered', '形参与实参')).toBe('「形参与实参」已标记为掌握');
    expect(reviewFeedback('review-again', '形参与实参')).toContain('25 分钟后再出现');
    expect(reviewFeedback('remind-later', '形参与实参', now)).toContain('今晚 20:00');
    expect(reviewFeedback('remind-later', '形参与实参', new Date('2025-03-04T21:00:00'))).toContain(
      '明天早上',
    );
  });
});

describe('复习分组与状态', () => {
  const overdue = item({ id: 'a', dueAt: '2025-03-03T09:00:00' });
  const today = item({ id: 'b', dueAt: '2025-03-04T09:00:00' });
  const soon = item({ id: 'c', dueAt: '2025-03-06T09:00:00' });
  const later = item({ id: 'd', dueAt: '2025-04-20T09:00:00' });
  const mastered = item({ id: 'e', state: 'mastered', dueAt: null });

  it('待复习包含逾期项，并按到期时间升序', () => {
    const buckets = groupReviewItems([today, overdue, soon, later, mastered], now);
    expect(buckets.due.map((entry) => entry.id)).toEqual(['a', 'b']);
    expect(buckets.upcoming.map((entry) => entry.id)).toEqual(['c', 'd']);
    expect(buckets.mastered.map((entry) => entry.id)).toEqual(['e']);
  });

  it('已掌握与归档不再算作待复习', () => {
    expect(isDueNow(overdue, now)).toBe(true);
    expect(isDueNow(mastered, now)).toBe(false);
    expect(isDueNow(item({ state: 'archived', dueAt: null }), now)).toBe(false);
  });

  it('列表行上的复习状态标签', () => {
    expect(reviewStatus(overdue, now)).toEqual({ label: '待复习', tone: 'due' });
    expect(reviewStatus(soon, now)).toEqual({ label: '即将复习', tone: 'soon' });
    expect(reviewStatus(later, now)).toEqual({ label: '已排期', tone: 'later' });
    expect(reviewStatus(mastered, now)).toEqual({ label: '已掌握', tone: 'mastered' });
  });
});
