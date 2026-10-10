let blocked = false;
export function isRestoring(): boolean { return blocked; }
export function assertWritable(): void { if (blocked) throw new Error('正在恢复备份，请等待数据重新加载'); }
export function beginRestore(): () => void { assertWritable(); blocked = true; return () => { blocked = false; }; }
