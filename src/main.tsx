import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { App } from './app/App';
import { LibraryProvider } from './app/LibraryProvider';
import { ToastProvider } from './app/ToastProvider';
import './styles/tokens.css';
import './styles/base.css';

/**
 * 在首次渲染前应用主题。
 * 这里不能使用内联 <script>（CSP 只允许 'self'），放在入口模块顶部同样能
 * 保证 React 第一次绘制前 <html> 上已经有 data-theme，不会闪白。
 */
function applyStoredTheme(): void {
  try {
    const raw = window.localStorage.getItem('maji.settings');
    const theme = raw ? (JSON.parse(raw) as { theme?: string }).theme : 'light';
    if (theme === 'dark') document.documentElement.dataset.theme = 'dark';
  } catch {
    // 读取失败时回退到浅色主题
  }
}

applyStoredTheme();

const container = document.getElementById('root');
if (!container) throw new Error('找不到 #root 挂载点');

createRoot(container).render(
  <StrictMode>
    {/* 桌面应用使用 HashRouter，打包后由 file:// 直接打开也能工作 */}
    <HashRouter>
      <ToastProvider>
        <LibraryProvider>
          <App />
        </LibraryProvider>
      </ToastProvider>
    </HashRouter>
  </StrictMode>,
);
