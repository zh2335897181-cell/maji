import { Info, Keyboard, Moon, PanelLeftOpen, Search, Settings, Sun, User } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { createContext, useContext } from 'react';
import { createPortal } from 'react-dom';
import { useLibrary } from '../../app/LibraryProvider';
import { useToast } from '../../app/ToastProvider';
import type { UpdateStatus } from '../../lib/ipc';
import { Button, IconButton } from '../ui/Button';
import { Kbd, SelectField, Switch } from '../ui/Fields';
import { Menu, type MenuEntry } from '../ui/Menu';
import { Modal } from '../ui/Modal';
import { SaveStatus } from './SaveStatus';
import { UpdateSettings } from './UpdateSettings';
import { AISettings } from '../../features/settings/AISettings';
import appPackage from '../../../package.json';
import styles from './TopBar.module.css';

/** 顶栏右侧插槽：编辑页把自己的操作（大纲、收藏、导出）投递到这里 */
const TopBarSlotContext = createContext<HTMLDivElement | null>(null);

export function TopBarSlotProvider({
  value,
  children,
}: {
  value: HTMLDivElement | null;
  children: ReactNode;
}): ReactElement {
  return <TopBarSlotContext.Provider value={value}>{children}</TopBarSlotContext.Provider>;
}

export function TopBarActions({ children }: { children: ReactNode }): ReactElement | null {
  const slot = useContext(TopBarSlotContext);
  if (!slot) return null;
  return createPortal(children, slot);
}

type ShortcutDefinition = { label: string; keys: string[]; alternate?: string[] };

const SHORTCUT_GROUPS: Array<{ label: string; shortcuts: ShortcutDefinition[] }> = [
  {
    label: '应用操作',
    shortcuts: [
      { label: '打开搜索', keys: ['Ctrl', 'K'] },
      { label: '新建笔记', keys: ['Ctrl', 'N'] },
      { label: '保存当前笔记', keys: ['Ctrl', 'S'] },
      { label: '编辑 / 阅读预览切换', keys: ['Ctrl', 'P'] },
      { label: '收起或展开左侧导航', keys: ['Ctrl', 'B'] },
      { label: '打开快捷键帮助', keys: ['Ctrl', '/'] },
      { label: '关闭浮层或对话框', keys: ['Esc'] },
    ],
  },
  {
    label: '笔记编辑',
    shortcuts: [
      { label: '撤销', keys: ['Ctrl', 'Z'] },
      { label: '重做', keys: ['Ctrl', 'Shift', 'Z'] },
      { label: '加粗', keys: ['Ctrl', 'B'] },
      { label: '斜体', keys: ['Ctrl', 'I'] },
      { label: '删除线', keys: ['Ctrl', 'Shift', 'S'] },
      { label: '行内代码', keys: ['Ctrl', 'E'] },
      { label: '代码块', keys: ['Ctrl', 'Alt', 'C'] },
      { label: '一级 / 二级 / 三级标题', keys: ['Ctrl', 'Shift', '1 / 2 / 3'] },
      { label: '高亮重点', keys: ['Ctrl', 'Shift', 'H'] },
      { label: '插入 3×3 表格', keys: ['Ctrl', 'Alt', 'T'] },
    ],
  },
];

export interface TopBarProps {
  onOpenSearch(): void;
  /** 窄窗口下显示“展开导航”按钮 */
  showDrawerToggle: boolean;
  onOpenDrawer(): void;
  /** 把右侧插槽节点交给上层，供页面用 Portal 投递操作 */
  slotRef(node: HTMLDivElement | null): void;
}

export function TopBar({
  onOpenSearch,
  showDrawerToggle,
  onOpenDrawer,
  slotRef,
}: TopBarProps): ReactElement {
  const { settings, updateSettings, source, notes } = useLibrary();
  const toast = useToast();
  const [dialog, setDialog] = useState<'settings' | 'shortcuts' | 'about' | null>(null);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ state: 'unsupported', currentVersion: '—', message: '自动更新仅在桌面应用中可用。' });
  const statusRef = useRef(updateStatus);
  const isDark = settings.theme === 'dark';

  const installUpdate = useCallback(async () => {
    if (!window.maji) return;
    try {
      await window.maji.updates.install();
    } catch (error) {
      toast.show({ message: error instanceof Error ? error.message : '安装更新失败，请重试。', tone: 'error' });
    }
  }, [toast]);

  const receiveUpdateStatus = useCallback((next: UpdateStatus) => {
    const previous = statusRef.current.state;
    statusRef.current = next;
    setUpdateStatus(next);
    if (next.state === previous) return;
    if (next.state === 'available') toast.show({ message: `发现新版本 ${next.version}，正在下载。`, tone: 'info' });
    if (next.state === 'downloaded') toast.show({ message: `新版本 ${next.version} 已下载，可以重启安装。`, tone: 'success', action: { label: '立即安装', onClick: () => void installUpdate() } });
    if (next.state === 'error') toast.show({ message: next.message, tone: 'error' });
  }, [installUpdate, toast]);

  useEffect(() => {
    const updates = window.maji?.updates;
    if (!updates) return;
    const unsubscribe = updates.onStatus(receiveUpdateStatus);
    void updates.getStatus().then(receiveUpdateStatus).catch(() => undefined);
    return unsubscribe;
  }, [receiveUpdateStatus]);

  useEffect(() => {
    const openAISettings = (): void => setDialog('settings');
    const openShortcuts = (): void => setDialog('shortcuts');
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== '/' || !event.ctrlKey || event.altKey || event.metaKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest('input, textarea, select, [role="dialog"]')) return;
      event.preventDefault();
      setDialog('shortcuts');
    };
    window.addEventListener('maji:open-ai-settings', openAISettings);
    window.addEventListener('maji:open-shortcuts', openShortcuts);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('maji:open-ai-settings', openAISettings);
      window.removeEventListener('maji:open-shortcuts', openShortcuts);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const checkForUpdates = useCallback(() => {
    if (!window.maji) {
      toast.show({ message: '自动更新仅在桌面应用中可用。', tone: 'info' });
      return;
    }
    void window.maji.updates.check().catch((error: unknown) => {
      toast.show({ message: error instanceof Error ? error.message : '检查更新失败，请重试。', tone: 'error' });
    });
  }, [toast]);

  const menuItems: MenuEntry[] = [
    {
      id: 'theme',
      label: isDark ? '切换到浅色主题' : '切换到深色主题',
      icon: isDark ? Sun : Moon,
      onSelect: () => void updateSettings({ theme: isDark ? 'light' : 'dark' }),
    },
    { id: 'settings', label: '偏好设置', icon: Settings, onSelect: () => setDialog('settings') },
    {
      id: 'shortcuts',
      label: '键盘快捷键',
      icon: Keyboard,
      onSelect: () => setDialog('shortcuts'),
    },
    { id: 'sep', separator: true },
    { id: 'about', label: '关于码迹', icon: Info, onSelect: () => setDialog('about') },
  ];

  return (
    <header className={styles.topbar}>
      <div className={styles.leading}>
        {showDrawerToggle ? (
          <IconButton icon={PanelLeftOpen} label="展开导航" onClick={onOpenDrawer} />
        ) : null}
        <button
          type="button"
          className={styles.searchTrigger}
          onClick={onOpenSearch}
          aria-keyshortcuts="Control+K"
        >
          <Search size={15} aria-hidden />
          <span className={styles.searchTriggerText}>搜索笔记、代码、标签…</span>
          <Kbd>Ctrl K</Kbd>
        </button>
      </div>

      <div className={styles.spacer} />

      <div className={styles.trailing}>
        <SaveStatus />
        <div className={styles.slot} ref={slotRef} />
        <Menu label="用户菜单" icon={User} text="小林" items={menuItems} align="end" />
      </div>

      <Modal
        open={dialog === 'settings'}
        onClose={() => setDialog(null)}
        title="偏好设置"
        description="设置保存在本机，不会上传。"
        icon={Settings}
      >
        <div className={styles.settingsGroup}>
          <Switch
            checked={isDark}
            onChange={(checked) => void updateSettings({ theme: checked ? 'dark' : 'light' })}
            label="深色主题"
            hint="浅色是默认方案；夜间长时间看代码时可以换成深色。"
          />
          <SelectField
            label="编辑器正文字号"
            hint="只影响笔记正文，不影响界面其他部分"
            value={String(settings.editorFontSize)}
            options={[
              { value: '14', label: '14px · 紧凑' },
              { value: '15', label: '15px · 默认' },
              { value: '16', label: '16px · 舒适' },
              { value: '17', label: '17px · 大字号' },
            ]}
            onChange={(event) => void updateSettings({ editorFontSize: Number(event.target.value) })}
          />
          <SelectField
            label="自动保存延迟"
            hint="停止输入后多久写入本地数据库"
            value={String(settings.autoSaveDelayMs)}
            options={[
              { value: '300', label: '0.3 秒' },
              { value: '700', label: '0.7 秒 · 默认' },
              { value: '1500', label: '1.5 秒' },
            ]}
            onChange={(event) => void updateSettings({ autoSaveDelayMs: Number(event.target.value) })}
          />
          <Switch
            checked={settings.sidebarCollapsed}
            onChange={(checked) => void updateSettings({ sidebarCollapsed: checked })}
            label="默认收起左侧课程导航"
            hint="窗口变窄时应用也会自动收起。"
          />
          <UpdateSettings status={updateStatus} onCheck={checkForUpdates} onInstall={() => void installUpdate()} />
          <AISettings onNotice={(message, tone) => toast.show({ message, tone })} />
        </div>
      </Modal>

      <Modal
        open={dialog === 'shortcuts'}
        onClose={() => setDialog(null)}
        title="键盘快捷键"
        description="核心操作都可以只用键盘完成。"
        icon={Keyboard}
      >
        <div className={styles.shortcutList}>
          {SHORTCUT_GROUPS.map((group) => (
            <section className={styles.shortcutGroup} key={group.label}>
              <h3>{group.label}</h3>
              {group.shortcuts.map((shortcut) => (
                <div className={styles.shortcutRow} key={shortcut.label}>
                  <span>{shortcut.label}</span>
                  <span className={styles.shortcutKeys}>
                    {shortcut.keys.map((key) => (
                      <Kbd key={key}>{key}</Kbd>
                    ))}
                    {shortcut.alternate ? (
                      <>
                        <span aria-hidden> / </span>
                        {shortcut.alternate.map((key) => <Kbd key={key}>{key}</Kbd>)}
                      </>
                    ) : null}
                  </span>
                </div>
              ))}
            </section>
          ))}
        </div>
      </Modal>

      <Modal
        open={dialog === 'about'}
        onClose={() => setDialog(null)}
        title="关于码迹"
        icon={Info}
        footer={
          <Button variant="secondary" onClick={() => setDialog(null)}>
            关闭
          </Button>
        }
      >
        <p className={styles.aboutText}>
          码迹 {appPackage.version} · 面向编程初学者的本地学习笔记。
          <br />
          当前数据源：
          <code>{source === 'sqlite' ? ' 本机 SQLite 数据库' : ' 浏览器示例数据（localStorage）'}</code>
          <br />
          已收录 {notes.length} 篇笔记，全部保存在你自己的电脑上。
        </p>
      </Modal>
    </header>
  );
}
