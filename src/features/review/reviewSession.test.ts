import { describe, expect, it } from 'vitest';
import { getActiveSecondsByLocalDay, formatReviewDuration } from './reviewSession';

function localDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

describe('review session duration helpers', () => {
  it('splits active seconds at local midnight and formats duration', () => {
    const start = new Date(2025, 2, 4, 23, 59, 0);
    const end = new Date(2025, 2, 5, 0, 2, 0);
    const result = getActiveSecondsByLocalDay([{ startedAt: start.toISOString(), endedAt: end.toISOString() }]);
    expect(result.get(localDay(start))).toBe(60);
    expect(result.get(localDay(end))).toBe(120);
    expect(formatReviewDuration(3_661)).toBe('1 小时 1 分钟');
    expect(formatReviewDuration(45 * 60)).toBe('45 分钟');
  });

  it('sums only active segments, merges overlap and ignores zero-length intervals', () => {
    const day = new Date(2025, 2, 4, 9, 0, 0);
    const at = (minutes: number): string => new Date(day.getTime() + minutes * 60_000).toISOString();
    const result = getActiveSecondsByLocalDay([
      { startedAt: at(0), endedAt: at(10) },
      { startedAt: at(20), endedAt: at(30) },
      { startedAt: at(40), endedAt: at(40) },
      { startedAt: at(25), endedAt: at(35) },
    ]);
    expect(result.get(localDay(day))).toBe(25 * 60);
  });

  it('includes an open active segment only through the supplied current time', () => {
    const start = new Date(2025, 2, 4, 23, 50, 0);
    const now = new Date(2025, 2, 5, 0, 5, 0);
    const result = getActiveSecondsByLocalDay([], start.toISOString(), now);
    expect(result.get(localDay(start))).toBe(10 * 60);
    expect(result.get(localDay(now))).toBe(5 * 60);
  });
});
