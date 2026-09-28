/* =============================================================================
   码迹 · 图标规范
   -----------------------------------------------------------------------------
   图标统一来自 Lucide React，使用同一套线性图标：尺寸 16px（工具栏 14px、
   行内 12px），默认线宽 2，不混用表情符号与其它图标库。

   界面上使用的图标清单（组件里按名从 lucide-react 直接引入）：
     导航     Home / Library / RotateCcw / Search / Plus / PanelLeftClose / PanelLeftOpen
     笔记     FileText / Star / Clock / ListTree / PenLine / Eye / Copy / Download / Share2
     编辑     Bold / Italic / Strikethrough / Code / Heading1-3 / List / ListOrdered
              ListChecks / Quote / Link2 / Image / Minus / Undo2 / Redo2 / Terminal
     语义块   Info / Lightbulb / TriangleAlert / Terminal
     操作     Trash2 / Pencil / FolderInput / Filter / SlidersHorizontal / Keyboard
     状态     CircleCheck / CircleAlert / LoaderCircle / Info
     课程     Book / Braces / Layout / Coffee / Binary / Terminal / Database / Globe / Palette / Cpu / Hash / Target
   ============================================================================= */

import {
  Binary,
  Book,
  BookOpen,
  Braces,
  Coffee,
  Cpu,
  Database,
  Globe,
  Hash,
  Layout,
  Palette,
  Target,
  Terminal,
  type LucideIcon,
} from 'lucide-react';

/** 课程图标：新建课程时只能从这里挑，避免出现风格不统一的图标 */
export const COURSE_ICONS: Record<string, LucideIcon> = {
  book: Book,
  braces: Braces,
  layout: Layout,
  coffee: Coffee,
  binary: Binary,
  terminal: Terminal,
  database: Database,
  globe: Globe,
  palette: Palette,
  cpu: Cpu,
  hash: Hash,
  target: Target,
};

export const COURSE_ICON_KEYS = Object.keys(COURSE_ICONS);

export function courseIcon(key: string): LucideIcon {
  return COURSE_ICONS[key] ?? BookOpen;
}

/** 课程配色只允许使用令牌里定义的低饱和色板 */
export const COURSE_COLOR_KEYS = [
  'teal',
  'blue',
  'violet',
  'amber',
  'green',
  'rose',
  'slate',
] as const;

export const COURSE_COLOR_LABELS: Record<string, string> = {
  teal: '青',
  blue: '蓝',
  violet: '紫',
  amber: '琥珀',
  green: '绿',
  rose: '玫瑰',
  slate: '灰',
};

export function courseColorVar(colorKey: string, channel: 'fg' | 'bg' | 'border' = 'fg'): string {
  const suffix = channel === 'fg' ? 'fg' : channel === 'bg' ? 'bg' : 'border';
  return `var(--course-${colorKey}-${suffix}, var(--accent))`;
}
