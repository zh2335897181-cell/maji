export interface SummaryProgress {
  state: 'running' | 'paused' | 'error' | 'done';
  stage: string;
  file?: string;
  completedFiles: number;
  totalFiles: number;
  completedRequests: number;
  message?: string;
  analyses?: string[];
}
export interface SummaryOptions {
  signal?: AbortSignal;
  fileAnalysis?(path: string, text: string): Promise<void>;
  progress?(stage: string, file?: string, completedFiles?: number): Promise<void>;
  cached?(key: string): Promise<string | null>;
  save?(key: string, result: string): Promise<void>;
}
