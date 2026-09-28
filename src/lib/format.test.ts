import { describe, expect, it } from 'vitest';
import { formatDueLabel, formatRelativeTime, formatSavedAt, formatTodayHeading } from './format';

const now = new Date('2025-03-04T15:30:00');

describe('时间格式化', () => {
  it('列表里的更新时间按距离远近切换表达', () => {
    expect(formatRelativeTime('2025-03-04T15:29:40', now)).toBe('刚刚');
    expect(formatRelativeTime('2025-03-04T15:05:00', now)).toBe('25 分钟前');
    expect(formatRelativeTime('2025-03-04T09:24:00', now)).toBe('今天 09:24');
    expect(formatRelativeTime('2025-03-03T21:10:00', now)).toBe('昨天 21:10');
    expect(formatRelativeTime('2025-03-02T10:00:00', now)).toBe('前天');
    expect(formatRelativeTime('2025-02-27T10:00:00', now)).toBe('5 天前');
    expect(formatRelativeTime('2025-01-20T10:00:00', now)).toBe('1月20日');
    expect(formatRelativeTime('2024-12-31T10:00:00', now)).toBe('2024年12月31日');
  });

  it('复习时间给出人话表达与语气', () => {
    expect(formatDueLabel('2025-03-03T09:00:00', now)).toEqual({ text: '已逾期 1 天', tone: 'overdue' });
    expect(formatDueLabel('2025-03-04T09:00:00', now)).toEqual({ text: '现在待复习', tone: 'today' });
    expect(formatDueLabel('2025-03-04T20:00:00', now)).toEqual({ text: '今天复习', tone: 'today' });
    expect(formatDueLabel('2025-03-05T09:00:00', now)).toEqual({ text: '明天复习', tone: 'soon' });
    expect(formatDueLabel('2025-03-06T09:00:00', now)).toEqual({ text: '后天复习', tone: 'soon' });
    expect(formatDueLabel('2025-03-08T09:00:00', now)).toEqual({ text: '4 天后复习', tone: 'soon' });
    expect(formatDueLabel('2025-03-20T09:00:00', now)).toEqual({ text: '3月20日复习', tone: 'later' });
    expect(formatDueLabel(null, now)).toEqual({ text: '未安排', tone: 'none' });
  });

  it('保存状态的文案', () => {
    expect(formatSavedAt(null, now)).toBe('尚未保存');
    expect(formatSavedAt('2025-03-04T15:29:55', now)).toBe('刚刚已保存');
    expect(formatSavedAt('2025-03-04T15:20:00', now)).toBe('10 分钟前已保存');
    expect(formatSavedAt('2025-03-04T09:24:00', now)).toBe('09:24 已保存');
  });

  it('首页日期标题包含星期', () => {
    expect(formatTodayHeading(now)).toBe('3月4日 周二');
  });
});
