let blocked = false;
let backgroundWriters=0;
export function holdBackgroundWrites():()=>void { assertWritable(); backgroundWriters++; let released=false;return()=>{if(!released){released=true;backgroundWriters--;}}; }
export function isRestoring(): boolean { return blocked; }
export function assertWritable(): void { if (blocked) throw new Error('正在恢复备份，请等待数据重新加载'); }
export function beginRestore(): () => void { assertWritable(); if(backgroundWriters)throw new Error('请先结束课堂录音并等待纪要生成完成，再恢复备份'); blocked = true; return () => { blocked = false; }; }
