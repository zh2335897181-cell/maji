import { useEffect, useState, type ReactElement } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { AppSidebar } from '../components/layout/AppSidebar';
import { SearchOverlay } from '../components/layout/SearchOverlay';
import { TopBar, TopBarSlotProvider } from '../components/layout/TopBar';
import { useBreakpoints } from '../lib/useMediaQuery';
import { ROUTES } from './routes';
import { useLibrary } from './LibraryProvider';
import styles from './AppLayout.module.css';

/** 全局快捷键：搜索、新建、保存、预览切换、侧栏折叠 */
function useGlobalShortcuts(handlers: {
  toggleSearch(): void;
  newNote(): void;
  toggleSidebar(): void;
}): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const meta = event.ctrlKey || event.metaKey;
      if (!meta) return;
      const key = event.key.toLowerCase();

      if (key === 'k') {
        event.preventDefault();
        handlers.toggleSearch();
        return;
      }
      if (key === 'n') {
        event.preventDefault();
        handlers.newNote();
        return;
      }
      if (key === 'b') {
        event.preventDefault();
        handlers.toggleSidebar();
        return;
      }
      if (key === 's') {
        // 阻止浏览器保存网页，改由编辑页立即写入本地数据库
        event.preventDefault();
        window.dispatchEvent(new CustomEvent('maji:save'));
        return;
      }
      if (key === 'p') {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent('maji:toggle-preview'));
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handlers]);
}

export function AppLayout(): ReactElement {
  const { settings, updateSettings, loading } = useLibrary();
  const { sidebarRail, sidebarDrawer } = useBreakpoints();
  const navigate = useNavigate();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);

  const collapsed = settings.sidebarCollapsed || sidebarRail;

  useGlobalShortcuts({
    toggleSearch: () => setSearchOpen((open) => !open),
    newNote: () => navigate(ROUTES.createWith('note')),
    toggleSidebar: () => void updateSettings({ sidebarCollapsed: !settings.sidebarCollapsed }),
  });

  // 窗口变宽后自动收起抽屉，避免遮住内容
  useEffect(() => {
    if (!sidebarDrawer && drawerOpen) setDrawerOpen(false);
  }, [sidebarDrawer, drawerOpen]);

  return (
    <TopBarSlotProvider value={slot}>
      <div className={styles.shell}>
        <AppSidebar
          collapsed={collapsed && !drawerOpen}
          asDrawer={sidebarDrawer && drawerOpen}
          onCloseDrawer={() => setDrawerOpen(false)}
          onToggleCollapsed={() => void updateSettings({ sidebarCollapsed: !collapsed })}
        />
        <div className={styles.main}>
          <TopBar
            onOpenSearch={() => setSearchOpen(true)}
            showDrawerToggle={sidebarDrawer}
            onOpenDrawer={() => setDrawerOpen(true)}
            slotRef={setSlot}
          />
          <div className={styles.body}>
            {loading ? (
              <div className={styles.loading} aria-busy="true" aria-label="正在读取本地数据">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div
                    className={styles.skeletonRow}
                    key={index}
                    style={{ width: `${[72, 88, 46, 64, 80, 52][index] ?? 60}%` }}
                  />
                ))}
              </div>
            ) : (
              <Outlet />
            )}
          </div>
        </div>
        <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
      </div>
    </TopBarSlotProvider>
  );
}
