import type { UpdateStatus } from '../../src/lib/ipc';

interface UpdateInfo {
  version?: string;
}

interface DownloadProgress {
  percent: number;
}

export interface UpdateUpdater {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  checkForUpdates(): Promise<unknown>;
  quitAndInstall(): void;
  on(event: 'checking-for-update', listener: () => void): unknown;
  on(
    event: 'update-available' | 'update-not-available' | 'update-downloaded',
    listener: (info: UpdateInfo) => void,
  ): unknown;
  on(event: 'download-progress', listener: (progress: DownloadProgress) => void): unknown;
  on(event: 'error', listener: (error: unknown) => void): unknown;
}

export interface UpdateRuntime {
  isPackaged: boolean;
  platform: NodeJS.Platform;
  hasFeed: boolean;
  currentVersion: string;
}

export interface UpdateService {
  checkForUpdates(): Promise<void>;
  installDownloadedUpdate(): void;
  getStatus(): UpdateStatus;
  subscribe(listener: (status: UpdateStatus) => void): () => void;
}

const GENERIC_UPDATE_ERROR = '检查或下载更新失败，请检查网络后重试。';

function updateVersion(info: UpdateInfo | undefined, fallback: string): string {
  return typeof info?.version === 'string' && info.version.trim() ? info.version : fallback;
}

export function createUpdateService(
  updater: UpdateUpdater,
  runtime: UpdateRuntime,
): UpdateService {
  const unsupportedMessage = !runtime.isPackaged
    ? '自动更新仅支持已安装的桌面版本。'
    : runtime.platform !== 'win32'
      ? '当前版本暂不支持自动更新。'
      : !runtime.hasFeed
        ? '此安装包尚未配置 GitHub 更新源。'
        : null;
  const supported = unsupportedMessage === null;
  let status: UpdateStatus = supported
    ? { state: 'idle', currentVersion: runtime.currentVersion }
    : {
        state: 'unsupported',
        currentVersion: runtime.currentVersion,
        message: unsupportedMessage ?? '自动更新不可用。',
      };
  let availableVersion = runtime.currentVersion;
  let checkInFlight: Promise<void> | null = null;
  const subscribers = new Set<(next: UpdateStatus) => void>();

  const publish = (next: UpdateStatus): void => {
    status = next;
    for (const subscriber of subscribers) subscriber(next);
  };

  if (supported) {
    updater.autoDownload = true;
    updater.autoInstallOnAppQuit = false;
  }

  updater.on('checking-for-update', () => {
    if (supported) publish({ state: 'checking', currentVersion: runtime.currentVersion });
  });
  updater.on('update-available', (info) => {
    if (!supported) return;
    availableVersion = updateVersion(info, runtime.currentVersion);
    publish({ state: 'available', currentVersion: runtime.currentVersion, version: availableVersion });
  });
  updater.on('update-not-available', () => {
    if (supported) publish({ state: 'latest', currentVersion: runtime.currentVersion });
  });
  updater.on('download-progress', (progress) => {
    if (!supported) return;
    const percent = Number.isFinite(progress.percent)
      ? Math.min(100, Math.max(0, progress.percent))
      : 0;
    publish({
      state: 'downloading',
      currentVersion: runtime.currentVersion,
      version: availableVersion,
      percent,
    });
  });
  updater.on('update-downloaded', (info) => {
    if (!supported) return;
    availableVersion = updateVersion(info, availableVersion);
    publish({ state: 'downloaded', currentVersion: runtime.currentVersion, version: availableVersion });
  });
  updater.on('error', () => {
    if (supported) publish({ state: 'error', currentVersion: runtime.currentVersion, message: GENERIC_UPDATE_ERROR });
  });

  return {
    async checkForUpdates() {
      if (!supported || status.state === 'downloading' || status.state === 'downloaded') return;
      if (checkInFlight) return checkInFlight;

      publish({ state: 'checking', currentVersion: runtime.currentVersion });
      const request = updater.checkForUpdates().then(
        () => undefined,
        () => {
          publish({ state: 'error', currentVersion: runtime.currentVersion, message: GENERIC_UPDATE_ERROR });
        },
      );
      checkInFlight = request;
      try {
        await request;
      } finally {
        if (checkInFlight === request) checkInFlight = null;
      }
    },
    installDownloadedUpdate() {
      if (!supported || status.state !== 'downloaded') {
        throw new Error('更新尚未下载完成。');
      }
      updater.quitAndInstall();
    },
    getStatus: () => status,
    subscribe(listener) {
      subscribers.add(listener);
      listener(status);
      return () => subscribers.delete(listener);
    },
  };
}
