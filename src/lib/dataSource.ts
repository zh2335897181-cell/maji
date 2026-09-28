/* =============================================================================
   码迹 · 数据源选择
   -----------------------------------------------------------------------------
   Electron 里 window.maji 由 preload 注入 → 走主进程 SQLite；
   浏览器里没有该对象 → 退回本地示例数据仓库，便于开发与端到端测试。
   ============================================================================= */

import { createIpcRepository, type MajiRepository } from './repository';
import { LocalRepository } from './localRepository';

let cached: MajiRepository | null = null;

export function getRepository(): MajiRepository {
  if (cached) return cached;
  const bridge = typeof window !== 'undefined' ? window.maji : undefined;
  cached = bridge ? createIpcRepository(bridge) : new LocalRepository();
  return cached;
}

export function isDesktopRuntime(): boolean {
  return typeof window !== 'undefined' && Boolean(window.maji);
}

/** 仅测试使用：清掉单例，让下一次调用重新选择数据源 */
export function resetRepositoryCache(): void {
  cached = null;
}
