import {useEffect,useState} from 'react';
import {Maximize2,X} from 'lucide-react';
import type {ClassroomFloatingSnapshot} from '../../lib/classroom';
import styles from './floating.module.css';
const time=(s:number)=>`${Math.floor(s/60).toString().padStart(2,'0')}:${Math.floor(s%60).toString().padStart(2,'0')}`;
export function ClassroomFloating(){
 const [data,setData]=useState<ClassroomFloatingSnapshot>({title:'课堂知识点',state:'starting'}),[error,setError]=useState('');
 useEffect(()=>{let mounted=true,pending=false;const poll=async()=>{if(pending||!window.maji?.classroom)return;pending=true;try{const next=await window.maji.classroom.floating();if(mounted){setData(next);setError('');}}catch{if(mounted)setError('暂时无法读取知识点');}finally{pending=false;}};void poll();const timer=setInterval(()=>void poll(),1200);return()=>{mounted=false;clearInterval(timer);};},[]);
 return <section className={styles.window}><header className={styles.header}><strong title={data.title}>课堂知识点</strong><button aria-label="恢复主窗口" onClick={()=>void window.maji?.classroom?.restoreMain()}><Maximize2 size={15}/></button><button aria-label="隐藏悬浮窗" onClick={()=>void window.maji?.classroom?.hideFloating()}><X size={16}/></button></header><div className={styles.content}>{error?<p>{error}</p>:data.summary?<><small>{time(data.summary.start)}–{time(data.summary.end)}{data.state==='paused'?' · 已暂停':''}</small><p className={styles.points}>{data.summary.text}</p></>:<p>等待首段知识点…<br/>每两分钟生成后自动替换。</p>}</div></section>;
}
