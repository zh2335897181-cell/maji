import clsx from 'clsx';
import {
  Database,
  CalendarDays,
  GitBranch,
  Home,
  Library,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RotateCcw,
  Search,
  X,
} from 'lucide-react';
import type { ReactElement } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useLibrary } from '../../app/LibraryProvider';
import { ROUTES } from '../../app/routes';
import { isDueNow } from '../../lib/review';
import { Button, IconButton } from '../ui/Button';
import styles from './AppSidebar.module.css';
import { CourseTree, RailCourseList } from './CourseTree';

export interface AppSidebarProps {
  /** 折叠为 56px 图标栏 */
  collapsed: boolean;
  /** 窄窗口下以抽屉形式覆盖显示 */
  asDrawer: boolean;
  onCloseDrawer(): void;
  onToggleCollapsed(): void;
}

/** 应用侧栏：产品标志 + 全局入口 + 课程目录 + 新建按钮 */
export function AppSidebar({
  collapsed,
  asDrawer,
  onCloseDrawer,
  onToggleCollapsed,
}: AppSidebarProps): ReactElement {
  const { courses, notes, reviews, source } = useLibrary();
  const navigate = useNavigate();
  const dueCount = reviews.filter((item) => isDueNow(item)).length;

  const navItems = [
    { to: ROUTES.home, icon: Home, label: '学习首页' },
    { to: ROUTES.courses, icon: Library, label: '课程与笔记', badge: notes.length },
    { to: ROUTES.mindMaps, icon: GitBranch, label: '思维导图' },
    { to: ROUTES.morning, icon: CalendarDays, label: '晨考' },
    { to: ROUTES.review, icon: RotateCcw, label: '复习', badge: dueCount, accent: true },
    { to: ROUTES.search, icon: Search, label: '搜索', hint: 'Ctrl K' },
  ];

  const sidebar = (
    <aside
      className={clsx(
        styles.sidebar,
        collapsed && styles.sidebarRail,
        asDrawer && styles.sidebarDrawer,
      )}
      aria-label="主导航"
    >
      <div className={styles.brand}>
        <span className={styles.brandMark} aria-hidden>
          码
        </span>
        {collapsed ? null : (
          <span className={styles.brandText}>
            <span className={styles.brandName}>码迹</span>
            <span className={styles.brandMeta}>编程学习笔记</span>
          </span>
        )}
        <span className={styles.brandActions}>
          {asDrawer ? (
            <IconButton icon={X} label="关闭导航" size="sm" onClick={onCloseDrawer} />
          ) : (
            <IconButton
              icon={collapsed ? PanelLeftOpen : PanelLeftClose}
              label={collapsed ? '展开侧栏' : '收起侧栏'}
              size="sm"
              onClick={onToggleCollapsed}
            />
          )}
        </span>
      </div>

      <nav className={styles.nav}>
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === ROUTES.home}
            title={collapsed ? item.label : undefined}
            className={({ isActive }) => clsx(styles.navItem, isActive && styles.navItemActive)}
          >
            <item.icon size={16} aria-hidden className={styles.navIcon} />
            {collapsed ? null : (
              <>
                <span className={styles.navLabel}>{item.label}</span>
                {item.badge !== undefined && item.badge > 0 ? (
                  <span className={clsx(styles.navBadge, item.accent && styles.navBadgeAccent)}>
                    {item.badge}
                  </span>
                ) : null}
                {item.hint ? <span className={styles.navHint}>{item.hint}</span> : null}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {collapsed ? (
        <RailCourseList />
      ) : (
        <div className={styles.treeSection}>
          <div className={styles.treeHeader}>
            <span className={styles.treeTitle}>课程</span>
            <IconButton
              icon={Plus}
              label="新建课程"
              size="sm"
              onClick={() => navigate(ROUTES.createWith('course'))}
            />
          </div>
          <div className={styles.treeScroll}>
            <CourseTree />
          </div>
        </div>
      )}

      <div className={styles.sidebarFooter}>
        {collapsed ? (
          <IconButton
            icon={Plus}
            label="新建内容"
            onClick={() => navigate(ROUTES.createWith('note'))}
          />
        ) : (
          <>
            <Button
              variant="primary"
              icon={Plus}
              onClick={() => navigate(ROUTES.createWith('note'))}
              style={{ width: '100%' }}
            >
              新建内容
            </Button>
            <span className={styles.storageHint}>
              <Database size={11} aria-hidden />
              {source === 'sqlite'
                ? '数据保存在本机数据库'
                : `浏览器示例数据 · ${courses.length} 门课程`}
            </span>
          </>
        )}
      </div>
    </aside>
  );

  if (!asDrawer) return sidebar;

  return (
    <>
      <div className={styles.drawerScrim} onClick={onCloseDrawer} role="presentation" />
      {sidebar}
    </>
  );
}

export function useActiveCourseId(): string | null {
  const location = useLocation();
  return new URLSearchParams(location.search).get('course');
}
