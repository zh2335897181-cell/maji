import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { SqliteDatabase } from '../db/connection';
import type { BackupPreview, BackupStatus } from '../../../src/lib/backup';
import { TABLES, readSnapshot, encodeBackup, decodeBackup, insertSnapshot, contentDigest } from './format';
import { atomicWrite, managedFiles, retainSeven, readBackupFile } from './files';
import { beginRestore } from './writeGate';

type Config = { enabled: boolean; day: string; digest: string; lastSuccessAt: string|null };
export class BackupService {
  private error: string|null = null;
  private pending: { token: string; data: ReturnType<typeof decodeBackup>; digest: string; expires: number }|null = null;
  private busy = false;
  readonly directory: string;
  constructor(private db: SqliteDatabase, userData: string, private version: string) { this.directory = join(userData, 'backups'); }
  private config(): Config {
    const row = this.db.prepare('SELECT value FROM settings WHERE key=?').get('backup.config') as {value:string}|undefined;
    try { return row ? JSON.parse(row.value) : {enabled:true,day:'',digest:'',lastSuccessAt:null}; } catch { return {enabled:true,day:'',digest:'',lastSuccessAt:null}; }
  }
  private setConfig(value: Config) { this.db.prepare('INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('backup.config',JSON.stringify(value)); }
  async status(): Promise<BackupStatus> { const c = this.config(); return {enabled:c.enabled,lastSuccessAt:c.lastSuccessAt,directory:this.directory,error:this.error,files:await managedFiles(this.directory)}; }
  async setEnabled(enabled: boolean) { if (typeof enabled !== 'boolean') throw new Error('自动备份设置无效'); if (this.busy) throw new Error('备份操作正在进行'); this.setConfig({...this.config(),enabled}); return this.status(); }
  private async exclusive<T>(action:()=>Promise<T>):Promise<T> {
    if (this.busy) throw new Error('请等待当前备份操作完成'); this.busy = true;
    try { const result = await action(); this.error = null; return result; } catch(e) { this.error = e instanceof Error?e.message:'备份操作失败'; throw e; } finally {this.busy=false;}
  }
  async exportTo(file: string):Promise<void> { return this.exclusive(async()=>{ const raw=encodeBackup(readSnapshot(this.db),this.version); decodeBackup(raw); await atomicWrite(file,raw); }); }
  async preview(file: string):Promise<BackupPreview> {
    return this.exclusive(async()=>{
      const data=decodeBackup(await readBackupFile(file)),token=randomUUID();
      this.pending={token,data,digest:contentDigest(readSnapshot(this.db)),expires:Date.now()+5*60*1000};
      return {token,createdAt:data.createdAt,appVersion:data.appVersion,schemaVersion:data.schemaVersion,counts:Object.fromEntries(TABLES.map(t=>[t,data.tables[t].length]))};
    });
  }
  async restore(token: string):Promise<void> {
    return this.exclusive(async()=>{
      const preview=this.pending;
      if (!preview || preview.token!==token || Date.now()>preview.expires) throw new Error('恢复预览已过期，请重新选择文件');
      this.pending=null;
      if (contentDigest(readSnapshot(this.db))!==preview.digest) throw new Error('当前数据已变化，请重新预览备份');
      const unblock=beginRestore();
      try {
        const raw=encodeBackup(readSnapshot(this.db),this.version); decodeBackup(raw);
        await atomicWrite(join(this.directory,`maji-safety-${Date.now()}-${randomUUID()}.json`),raw);
        this.db.transaction(()=>{
          for(const table of [...TABLES].reverse()) this.db.prepare(`DELETE FROM ${table}`).run();
          insertSnapshot(this.db,preview.data.tables);
          if ((this.db.pragma('foreign_key_check') as unknown[]).length) throw new Error('恢复关联检查失败');
          this.db.prepare('INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('backup.initialized','true');
        })();
        await retainSeven(this.directory,'safety').catch(()=>{});
      } finally { unblock(); }
    });
  }
  async autoBackup(now=new Date()):Promise<void> {
    return this.exclusive(async()=>{
      const config=this.config(); if(!config.enabled)return;
      const day=`${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()}`,snapshot=readSnapshot(this.db),digest=contentDigest(snapshot);
      if(config.day===day || config.digest===digest)return;
      const raw=encodeBackup(snapshot,this.version,now);decodeBackup(raw);
      await atomicWrite(join(this.directory,`maji-auto-${now.getTime()}-${randomUUID()}.json`),raw);
      this.setConfig({...config,day,digest,lastSuccessAt:now.toISOString()});
      await retainSeven(this.directory,'auto');
    });
  }
}
