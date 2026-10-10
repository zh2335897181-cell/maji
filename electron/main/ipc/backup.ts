import { dialog, shell, type IpcMainInvokeEvent } from 'electron';
import { IPC } from '../../../src/lib/ipc';
import { BackupService } from '../backup/service';
import { beginRestore } from '../backup/writeGate';
export function createBackupHandlers(service: BackupService) {
  let owner: number | null = null;
  return {
    [IPC.backupStatus]: () => service.status(),
    [IPC.backupEnabled]: (args: unknown[]) => service.setEnabled(args[0] as boolean),
    [IPC.backupDirectory]: async () => { await service.status(); const reason = await shell.openPath(service.directory); if(reason) throw new Error('无法打开备份目录'); },
    [IPC.backupExport]: async () => {
      const result = await dialog.showSaveDialog({ title:'导出学习数据备份', defaultPath:`maji-backup-${new Date().toISOString().slice(0,10)}.json`, filters:[{name:'码迹备份',extensions:['json']}] });
      if(result.canceled || !result.filePath)return {saved:false};
      await service.exportTo(result.filePath); return {saved:true};
    },
    [IPC.backupPreview]: async (_args: unknown[], event: IpcMainInvokeEvent) => {
      const result=await dialog.showOpenDialog({title:'选择码迹备份',properties:['openFile'],filters:[{name:'码迹备份',extensions:['json']}]});
      if(result.canceled || !result.filePaths[0])return null;
      const preview=await service.preview(result.filePaths[0]);owner=event.sender.id;return preview;
    },
    [IPC.backupRestore]: async (args: unknown[], event: IpcMainInvokeEvent) => {
      if(owner!==event.sender.id || typeof args[0]!=='string')throw new Error('恢复确认无效，请重新预览');
      await service.restore(args[0]); owner=null;
      // Keep old pages and late AI writes blocked until the restored page finishes loading.
      const unblock=beginRestore();
      const release = () => { unblock(); event.sender.removeListener('did-finish-load', release); event.sender.removeListener('destroyed', release); };
      event.sender.once('did-finish-load',release);event.sender.once('destroyed',release);
      // A crashed renderer must not silently resume writes to the restored database.
    },
  };
}
