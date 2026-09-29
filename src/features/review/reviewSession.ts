import type { ActiveTimeSegment } from '../../lib/types';

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function mergeSegments(segments: ActiveTimeSegment[]): ActiveTimeSegment[] {
  const sorted = segments
    .map((segment) => ({ start: Date.parse(segment.startedAt), end: Date.parse(segment.endedAt) }))
    .filter((segment) => Number.isFinite(segment.start) && Number.isFinite(segment.end) && segment.end > segment.start)
    .sort((a, b) => a.start - b.start);
  const merged: Array<{ start: number; end: number }> = [];
  for (const segment of sorted) {
    const previous = merged.at(-1);
    if (previous && segment.start <= previous.end) previous.end = Math.max(previous.end, segment.end);
    else merged.push({ ...segment });
  }
  return merged.map(({ start, end }) => ({ startedAt: new Date(start).toISOString(), endedAt: new Date(end).toISOString() }));
}

/** 把已完成与当前进行中的活跃时段按本地日期切分，暂停时间不计入。 */
export function getActiveSecondsByLocalDay(
  segments: ActiveTimeSegment[],
  activeSegmentStartedAt: string | null = null,
  now = new Date(),
): Map<string, number> {
  const intervals = [...segments];
  if (activeSegmentStartedAt) intervals.push({ startedAt: activeSegmentStartedAt, endedAt: now.toISOString() });
  const millisecondsByDay = new Map<string, number>();

  for (const segment of mergeSegments(intervals)) {
    let cursor = Date.parse(segment.startedAt);
    const end = Date.parse(segment.endedAt);
    while (cursor < end) {
      const day = new Date(cursor);
      const nextMidnight = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).getTime();
      const chunkEnd = Math.min(end, nextMidnight);
      const key = dayKey(day);
      millisecondsByDay.set(key, (millisecondsByDay.get(key) ?? 0) + chunkEnd - cursor);
      cursor = chunkEnd;
    }
  }

  return new Map([...millisecondsByDay].map(([day, milliseconds]) => [day, Math.floor(milliseconds / 1000)]));
}

export function formatReviewDuration(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3_600);
  const minutes = Math.floor((safeSeconds % 3_600) / 60);
  if (hours > 0) return `${hours} 小时${minutes > 0 ? ` ${minutes} 分钟` : ''}`;
  return `${minutes} 分钟`;
}
