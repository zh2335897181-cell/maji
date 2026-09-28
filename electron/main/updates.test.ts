import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { createUpdateService } from './updates';

class FakeUpdater extends EventEmitter {
  autoDownload = false;
  autoInstallOnAppQuit = true;
  checkForUpdates = vi.fn<() => Promise<void>>(async () => undefined);
  quitAndInstall = vi.fn();
}

function setup(runtime: Partial<{ isPackaged: boolean; platform: NodeJS.Platform; hasFeed: boolean }> = {}) {
  const updater = new FakeUpdater();
  const service = createUpdateService(updater, {
    isPackaged: true,
    platform: 'win32',
    hasFeed: true,
    currentVersion: '0.1.0',
    ...runtime,
  });
  const states: string[] = [];
  service.subscribe((status) => states.push(status.state));
  return { updater, service, states };
}

describe('桌面更新服务', () => {
  it('开发版或未配置更新源时不发起网络检查', async () => {
    const { updater, service, states } = setup({ isPackaged: false });
    await service.checkForUpdates();
    expect(states[0]).toBe('unsupported');
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
  });

  it('同一时间的重复检查共用一个更新请求', async () => {
    let resolveCheck: (() => void) | undefined;
    const { updater, service } = setup();
    updater.checkForUpdates.mockImplementation(
      () => new Promise<void>((resolve) => { resolveCheck = resolve; }),
    );

    const first = service.checkForUpdates();
    const second = service.checkForUpdates();
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
    resolveCheck?.();
    await Promise.all([first, second]);
  });

  it('将“无更新”事件转换为最新状态', async () => {
    const { updater, service, states } = setup();
    await service.checkForUpdates();
    updater.emit('update-not-available', { version: '0.1.0' });
    expect(states.at(-1)).toBe('latest');
  });

  it('转发更新版本与限制在 0 到 100 的下载进度', () => {
    const { updater, service } = setup();
    const statuses: Array<{ state: string; version?: string; percent?: number }> = [];
    service.subscribe((status) => statuses.push(status));
    updater.emit('update-available', { version: '0.2.0' });
    updater.emit('download-progress', { percent: 37.5 });
    updater.emit('download-progress', { percent: 120 });

    expect(statuses.map((status) => status.state)).toEqual([
      'idle',
      'available',
      'downloading',
      'downloading',
    ]);
    expect(statuses[2]).toMatchObject({ version: '0.2.0', percent: 37.5 });
    expect(statuses[3]?.percent).toBe(100);
  });

  it('仅在更新下载完成后允许重启安装', () => {
    const { updater, service, states } = setup();
    expect(() => service.installDownloadedUpdate()).toThrow();
    expect(updater.quitAndInstall).not.toHaveBeenCalled();

    updater.emit('update-downloaded', { version: '0.2.0' });
    expect(states.at(-1)).toBe('downloaded');
    service.installDownloadedUpdate();
    expect(updater.quitAndInstall).toHaveBeenCalledTimes(1);
  });

  it('更新检查失败时提供不泄露网络细节的可重试状态', () => {
    const { updater, service, states } = setup();
    updater.emit('error', new Error('request failed: https://example.test/private-token'));
    expect(states.at(-1)).toBe('error');
    expect(service.getStatus()).toMatchObject({ state: 'error' });
    expect(JSON.stringify(service.getStatus())).not.toContain('private-token');
  });
});
