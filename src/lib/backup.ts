export interface BackupPreview { token: string; createdAt: string; appVersion: string; schemaVersion: number; counts: Record<string, number> }
export interface BackupStatus { enabled: boolean; lastSuccessAt: string | null; directory: string; error: string | null; files: Array<{ name: string; createdAt: string; kind: 'auto' | 'safety' }> }
export interface BackupApi {
  status(): Promise<BackupStatus>;
  setEnabled(enabled: boolean): Promise<BackupStatus>;
  export(): Promise<{ saved: boolean }>;
  preview(): Promise<BackupPreview | null>;
  restore(token: string): Promise<void>;
  openDirectory(): Promise<void>;
}
