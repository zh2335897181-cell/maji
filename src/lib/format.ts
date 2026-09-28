/* =============================================================================
   码迹 · 时间与状态文案格式化（纯函数）
   ============================================================================= */

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}

export function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/** 相差多少个自然日（按本地日历天计算，避免跨零点时显示错误） */
export function diffDays(target: Date, from: Date): number {
  const a = startOfDay(target).getTime();
  const b = startOfDay(from).getTime();
  return Math.round((a - b) / DAY);
}

export function formatTime(iso: string): string {
  const date = new Date(iso);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

/** 列表里的“更新时间”：刚刚 / 12 分钟前 / 今天 09:24 / 昨天 21:10 / 3 天前 / 3月4日 */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const delta = now.getTime() - date.getTime();

  if (delta < MINUTE) return '刚刚';
  if (delta < HOUR) return `${Math.floor(delta / MINUTE)} 分钟前`;

  const days = diffDays(date, now);
  if (days === 0) return `今天 ${formatTime(iso)}`;
  if (days === -1) return `昨天 ${formatTime(iso)}`;
  if (days === -2) return '前天';
  if (days > -7) return `${Math.abs(days)} 天前`;
  if (date.getFullYear() === now.getFullYear()) {
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  }
  return formatDate(iso);
}

export type DueTone = 'overdue' | 'today' | 'soon' | 'later' | 'none';

export interface DueLabel {
  text: string;
  tone: DueTone;
}

/**
 * 复习时间的人话表达。
 * 例：已逾期 2 天 / 今天复习 / 明天复习 / 3 天后复习 / 已掌握
 */
export function formatDueLabel(dueAt: string | null, now: Date = new Date()): DueLabel {
  if (!dueAt) return { text: '未安排', tone: 'none' };

  const date = new Date(dueAt);
  const days = diffDays(date, now);
  const overdue = date.getTime() < now.getTime();

  if (days === 0) {
    if (overdue) return { text: '现在待复习', tone: 'today' };
    return { text: '今天复习', tone: 'today' };
  }
  if (days < 0) return { text: `已逾期 ${Math.abs(days)} 天`, tone: 'overdue' };
  if (days === 1) return { text: '明天复习', tone: 'soon' };
  if (days === 2) return { text: '后天复习', tone: 'soon' };
  if (days <= 7) return { text: `${days} 天后复习`, tone: 'soon' };
  return { text: `${date.getMonth() + 1}月${date.getDate()}日复习`, tone: 'later' };
}

/** 保存状态的文案：刚刚保存过 / 1 分钟前保存 */
export function formatSavedAt(iso: string | null, now: Date = new Date()): string {
  if (!iso) return '尚未保存';
  const delta = now.getTime() - new Date(iso).getTime();
  if (delta < 10 * 1000) return '刚刚已保存';
  if (delta < HOUR) return `${Math.max(1, Math.floor(delta / MINUTE))} 分钟前已保存`;
  return `${formatTime(iso)} 已保存`;
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

/** 首页“今天”的日期标题：3月4日 周二 */
export function formatTodayHeading(now: Date = new Date()): string {
  return `${now.getMonth() + 1}月${now.getDate()}日 ${WEEKDAYS[now.getDay()]}`;
}

export function formatGreeting(now: Date = new Date()): string {
  const hour = now.getHours();
  if (hour < 6) return '夜深了';
  if (hour < 11) return '早上好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
}
