import { useEffect, useRef, useState } from 'react';
import { Mic, Plus, Square, Upload, Download, Sparkles } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import type { ClassroomRecord, ClassroomStatus } from '../../lib/classroom';
import { transcriptGroups } from '../../lib/classroom';
import styles from './classroom.module.css';
const time=(s:number)=>`${Math.floor(s/60).toString().padStart(2,'0')}:${Math.floor(s%60).toString().padStart(2,'0')}`;
const names={idle:'未在录音',starting:'正在加载模型',recording:'正在录音与转写',importing:'正在导入转写',stopping:'正在结束并整理尾段'};
function TranscriptGroups({record}:{record:ClassroomRecord}) {
 const groups=transcriptGroups(record.chunks);
 return <section className={styles.transcript} aria-label="分段转写原文"><h3>转写原文 · 每两分钟一组</h3><p className={styles.transcriptHint}>每组内部从 00:00 计时，标题为课堂总时间。</p>{groups.map((group,i)=><details key={`${record.id}-${group.start}`} className={styles.transcriptGroup} open={i===groups.length-1}><summary>{time(group.start)}–{time(group.end)} <span>· {group.chunks.length} 段原文</span></summary><div className={styles.transcriptScroll} tabIndex={0} role="region" aria-label={`${time(group.start)} 起的转写原文`}><ol className={styles.transcriptList}>{group.chunks.map(c=><li key={c.start}><time>{time(c.start-group.start)}–{time(c.end-group.start)}</time><p>{c.text}</p></li>)}</ol></div></details>)}{!groups.length&&<p>等待转写内容…</p>}</section>;
}
export function ClassroomPage(){
 const api=window.maji?.classroom;
 const [rows,setRows]=useState<ClassroomRecord[]>([]),[status,setStatus]=useState<ClassroomStatus>({installed:false,state:'idle',activeId:null,error:'',device:''});
 const [selected,setSelected]=useState(''),[error,setError]=useState(''),[open,setOpen]=useState(false),[title,setTitle]=useState(''),[source,setSource]=useState<'system'|'microphone'>('system'),[ai,setAI]=useState(true),[importing,setImporting]=useState(false),[busy,setBusy]=useState(false);
 const live=useRef(true),polling=useRef(false),locked=useRef(false);
 const record=rows.find(r=>r.id===selected)??rows[0],active=status.state!=='idle';
 useEffect(()=>{live.current=true;
   const poll=async()=>{if(!api||polling.current)return;polling.current=true;try{const [s,r]=await Promise.all([api.status(),api.list()]);if(live.current){setStatus(s);setRows(r);}}catch(e){if(live.current)setError(String(e));}finally{polling.current=false;}};
   void poll();const timer=setInterval(()=>void poll(),1500);return()=>{live.current=false;clearInterval(timer);};
 },[api]);
 async function run(action:()=>Promise<unknown>){if(locked.current)return;locked.current=true;setBusy(true);setError('');try{await action();}catch(e){setError(e instanceof Error?e.message:String(e));}finally{locked.current=false;if(live.current)setBusy(false);}}
 async function start(){if(!api)return;await run(async()=>{const id=importing?await api.importAudio(title,ai):await api.start(title,source,ai);if(id){setSelected(id);setOpen(false);setStatus(s=>({...s,state:'starting',activeId:id}));}});}
 function download(){if(!record)return;const text=`# ${record.title}\n\n${record.summaries.map(s=>`## ${time(s.start)}–${time(s.end)}\n${s.error?'生成失败：'+s.error:s.text||'等待生成'}`).join('\n\n')}\n\n# 转写原文\n\n${record.chunks.filter(c=>c.text).map(c=>`[${time(c.start)}–${time(c.end)}] ${c.text}`).join('\n\n')}`;const url=URL.createObjectURL(new Blob([text],{type:'text/markdown;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=record.title.replace(/[<>:"/\\|?*]/g,'_')+'.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 return <section className={styles.page} data-scroll-container>
  <header className={styles.header}><div><h1><Mic size={24}/>课堂纪要</h1><p>听课时记录原文，每两分钟只整理关键知识点。</p></div><div className={styles.actions}><Button icon={Upload} variant="secondary" disabled={!api||!status.installed||active||busy} onClick={()=>{setTitle('课堂录音 '+new Date().toLocaleDateString());setImporting(true);setOpen(true);}}>导入录音</Button><Button icon={Plus} disabled={!api||!status.installed||active||busy} onClick={()=>{setTitle('课堂纪要 '+new Date().toLocaleDateString());setImporting(false);setOpen(true);}}>开始课堂</Button></div></header>
  <div className={styles.status} role="status"><span className={active?styles.dotActive:styles.dot}/><strong>{names[status.state]}</strong><span>{status.installed?'SenseVoice INT8 · 本地 CPU 转写':'本地模型未就绪'}</span>{status.device&&<small>设备：{status.device}</small>}{active&&<Button icon={Square} disabled={busy||status.state==='stopping'} variant="secondary" onClick={()=>void run(()=>api!.stop())}>结束课堂</Button>}</div>
  {!api&&<p className={styles.notice}>请在新版桌面应用中使用本地录音；浏览器只展示模块界面。</p>}
  {api&&!status.installed&&<p className={styles.notice}>请安装本地模型与 Python 运行环境，参见项目 docs/classroom-minutes.md。安装后无需网络即可转写。</p>}
  {(error||status.error)&&<p className={styles.error} role="alert">{error||status.error}</p>}
  <div className={styles.layout}><aside className={styles.list} aria-label="课堂记录">{rows.map(r=><button key={r.id} aria-pressed={record?.id===r.id} onClick={()=>setSelected(r.id)}><strong>{r.title}</strong><small>{new Date(r.createdAt).toLocaleString()} · {r.summaries.length} 段纪要</small>{status.activeId===r.id&&<span>正在记录</span>}</button>)}{!rows.length&&<p>每次课堂独立保存，结束后可随时回来查看。</p>}</aside>
   <main className={styles.main}>{record?<><div className={styles.recordHeader}><div><h2>{record.title}</h2><small>{record.chunks.length} 段转写 · {record.aiEnabled?'自动 AI 纪要已开启':'仅本地转写'}</small></div><Button icon={Download} variant="secondary" onClick={download}>导出 Markdown</Button></div>
   {record.summaries.length===0&&<div className={styles.empty}><Sparkles/><h3>{record.aiEnabled?'等待下一段关键知识点':'原文仅在本机转写和保存'}</h3><p>{record.aiEnabled?'累计两分钟后生成 80～150 字摘要；结束课堂会处理不足两分钟的尾段。':'本课堂未开启 AI 纪要，不会向 AI 服务发送文字。'}</p></div>}
   {record.summaries.map((s,i)=><article key={`${s.start}-${s.end}`} className={styles.card}><header><strong>{time(s.start)}–{time(s.end)}</strong><span>关键知识点</span></header>{s.error?<><p role="alert" className={styles.error}>{s.error}</p><Button disabled={busy||active} onClick={()=>void run(()=>api!.retry(record.id,i))}>重试本段纪要</Button></>:<p className={styles.summary}>{s.text||'正在整理本段知识点…'}</p>}<details><summary>查看本段原文</summary>{record.chunks.filter(c=>c.end>s.start&&c.start<s.end&&c.text).map(c=><p key={c.start}><time>{time(c.start)} </time>{c.text}</p>)}</details></article>)}
   <TranscriptGroups record={record}/>
   </>:<div className={styles.empty}><Mic size={36}/><h2>把课堂重点留下来</h2><p>电脑声音、麦克风或录音文件 → 本地转写 → 两分钟精简纪要。</p><p>类名、注解和方法名仍需核对；不会自动补写老师未讲的代码。</p></div>}</main></div>
  <Modal open={open} title={importing?'导入课堂录音':'开始课堂纪要'} onClose={()=>{if(!busy)setOpen(false);}} footer={<><Button variant="secondary" disabled={busy} onClick={()=>setOpen(false)}>取消</Button><Button disabled={busy||!title.trim()} onClick={()=>void start()}>{busy?'正在准备…':importing?'选择录音':'开始录音'}</Button></>}>
   <div className={styles.form}><label>课堂名称<input aria-label="课堂名称" value={title} maxLength={200} onChange={e=>setTitle(e.target.value)}/></label>{!importing&&<label>录音来源<select aria-label="录音来源" value={source} onChange={e=>setSource(e.target.value as 'system'|'microphone')}><option value="system">电脑声音（腾讯会议、网课）</option><option value="microphone">默认麦克风</option></select></label>}
   <label className={styles.check}><input type="checkbox" checked={ai} onChange={e=>setAI(e.target.checked)}/>每两分钟生成 AI 纪要（80～150 字）</label><p>音频由本地模型识别，不上传音频。开启 AI 纪要后，本课堂转写文字与少量前文摘要会发送到你配置的 AI 服务；未开启则仅保存在本机。请确认你有权记录课堂内容。</p><p>默认不保存原始录音，保留带时间的转写与纪要。录音期间可切换页面，关闭应用会停止记录。</p>{error&&<p className={styles.error} role="alert">{error}</p>}</div>
  </Modal>
 </section>;
}
