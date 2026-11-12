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


function updateFailure(error:unknown,downloading:boolean){
  const row=error as {code?:unknown;message?:unknown}|undefined;
  const text=typeof row?.message==='string'?row.message:typeof error==='string'?error:'';
  const rawCode=typeof row?.code==='string'?row.code:'';
  const code=/^[A-Z][A-Z0-9_]{1,70}$/.test(rawCode)?rawCode:(text.match(/\b(?:ERR_[A-Z_]+|EACCES|EPERM|ENOSPC|ETIMEDOUT|ECONNRESET|ENOTFOUND)\b/)?.[0]??'UNKNOWN');
  let phase=downloading?'下载安装包':'检查版本';
  let reason='暂时无法完成，请重试，或从官方发布页下载安装包。';
  if(/sha512|checksum|digest|signature/i.test(text+code)){phase='校验安装包';reason='文件校验未通过，请重新下载官方安装包。';}
  else if(/ENOSPC|disk.*space/i.test(text+code))reason='磁盘空间不足，请清理空间后重试。';
  else if(/EACCES|EPERM|permission/i.test(text+code))reason='无法写入更新文件，请检查目录权限或安全软件拦截记录。';
  else if(/timeout|timed.?out|ETIMEDOUT/i.test(text+code))reason='连接超时，请稍后重试。';
  else if(/ENOTFOUND|ECONN|ERR_(?:PROXY|TUNNEL|INTERNET|NAME|CONNECTION|CERT)|network|certificate/i.test(text+code))reason='无法连接更新服务器，请检查网络、代理或证书设置。';
  else if(/404|ERR_UPDATER_LATEST_VERSION_NOT_FOUND|ERR_UPDATER_CHANNEL_FILE_NOT_FOUND/.test(text+code))reason='更新文件暂时不可用，请稍后重试或打开官方发布页。';
  else if(/403|429/.test(text+code))reason='更新服务器暂时拒绝请求或请求过于频繁，请稍后重试。';
  return {phase,code,message:phase+'失败。'+reason};
}


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
  const fail=(error:unknown)=>{
    if(!supported||status.state==='downloaded')return;
    const downloading=status.state==='available'||status.state==='downloading'||availableVersion!==runtime.currentVersion;
    publish({state:'error',currentVersion:runtime.currentVersion,...updateFailure(error,downloading)});
  };
  updater.on('error', fail);

  return {
    async checkForUpdates() {
      if (!supported || status.state === 'downloading' || status.state === 'downloaded') return;
      if (checkInFlight) return checkInFlight;

      publish({ state: 'checking', currentVersion: runtime.currentVersion });
      const request = updater.checkForUpdates().then(
        () => undefined,
        fail,
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
