import { useEffect, useState } from 'react';

/** 媒体查询订阅；Electron 窗口缩放时会实时更新 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(query).matches,
  );

  useEffect(() => {
    const list = window.matchMedia(query);
    const onChange = (event: MediaQueryListEvent): void => setMatches(event.matches);
    setMatches(list.matches);
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

export interface BreakpointState {
  /** < 1360px：右侧辅助栏默认收起 */
  asideAutoHidden: boolean;
  /** < 1200px：左侧导航折叠为图标栏 */
  sidebarRail: boolean;
  /** < 1000px：左侧导航变为浮层抽屉 */
  sidebarDrawer: boolean;
}

/**
 * 三档响应式断点，对应设计说明里的折叠顺序：
 * 先收右栏 → 再收左栏 → 最后左栏变抽屉，编辑区始终保持可读宽度。
 */
export function useBreakpoints(): BreakpointState {
  const asideAutoHidden = useMediaQuery('(max-width: 1359px)');
  const sidebarRail = useMediaQuery('(max-width: 1199px)');
  const sidebarDrawer = useMediaQuery('(max-width: 999px)');
  return { asideAutoHidden, sidebarRail, sidebarDrawer };
}
