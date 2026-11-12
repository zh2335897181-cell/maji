import {useEffect,useState} from 'react';
import {Button} from '../../components/ui/Button';
import {Modal} from '../../components/ui/Modal';
import type {LocalInspection,LocalJob,LocalProbe,SpeechEngine,SpeechDevice} from '../../lib/localAI';
import styles from './AISettings.module.css';
export function LocalModels({speech=false,onSelect}:{speech?:boolean;onSelect:(model:string)=>void}){
 const api=window.maji?.ai.local;
 const [report,setReport]=useState<LocalInspection|null>(null),[job,setJob]=useState<LocalJob|null>(null),[probe,setProbe]=useState<LocalProbe|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[install,setInstall]=useState<{name:string;sizeGB:number}|null>(null);
 const [custom,setCustom]=useState('');
 const [speechChoice,setSpeechChoice]=useState<SpeechEngine>('sensevoice');
 const [speechDevice,setSpeechDevice]=useState<SpeechDevice>('auto');
 useEffect(()=>{if(report){setSpeechChoice(report.speechEngine??'sensevoice');setSpeechDevice(report.speechDevice??'auto');}},[report?.speechEngine,report?.speechDevice]);
 async function run(action:()=>Promise<unknown>){setBusy(true);setError('');try{await action();}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}}
 async function refresh(){if(api)setReport(await api.inspect());}
 useEffect(()=>{let alive=true;if(api)void api.inspect().then(r=>{if(alive)setReport(r);}).catch(e=>{if(alive)setError(String(e));});return()=>{alive=false;};},[api]);
 useEffect(()=>{if(!api)return;let live=true,inFlight=false;const poll=async()=>{if(inFlight)return;inFlight=true;try{const next=await api.job();if(live)setJob(next);}catch{/* Show explicit action errors */}finally{inFlight=false;}};void poll();const timer=setInterval(()=>void poll(),1000);return()=>{live=false;clearInterval(timer);};},[api]);
 useEffect(()=>{
   if(!speech||!api||!job||!['done','error'].includes(job.state))return;
   let live=true;
   void api.inspect().then(next=>{if(live)setReport(next);}).catch(cause=>{if(live)setError(String(cause));});
   return()=>{live=false;};
 },[api,speech,job?.state]);
 if(!api)return <p className={styles.muted}>本地模型管理需要新版桌面应用。</p>;
 const disabled=busy||job?.state==='running';
 return <section className={styles.localPanel} aria-label={speech?'本地语音模型':'本地文字模型'}>
 <div className={styles.heading}><h3>{speech?'语音转写模型':'Ollama 本地模型'}</h3><Button variant="secondary" disabled={disabled} onClick={()=>void run(refresh)}>检测本机并刷新</Button></div>
 {report&&<><div className={styles.hardware}><strong>{report.hardware.cpu}</strong><span>内存 {report.hardware.ramGB}GB（可用约 {report.hardware.freeGB}GB）</span><span>{report.hardware.gpu} · 显存约 {report.hardware.vramGB}GB</span><small>推荐依据为资源估算；模型上下文、后台程序和实际生成速度会影响可用性。</small></div>
 {speech?<>
 <p className={styles.muted}>安装位置：{report.speechRuntimePath??'默认用户目录'} · 此目录已用约 {report.speechUsedGB??0}GB{report.speechFreeGB!==null&&report.speechFreeGB!==undefined?' · 可用 '+report.speechFreeGB+'GB':''}</p>
 <Button variant="secondary" disabled={disabled} onClick={()=>void run(()=>api.relocateSpeech())}>选择磁盘并迁移模型</Button>
 <p className={styles.muted}>SenseVoice 建议预留 2GB；Qwen 模型、运行环境和下载缓存建议预留 15GB。迁移校验完成后启用新位置，原目录可核对后手动清理。</p>
 {report.speechInstallPending?.map(engine=><Button key={engine} variant="secondary" disabled={disabled}
   onClick={()=>void run(()=>api.installSpeech(engine))}>继续安装 {engine==='qwen3-asr'?'Qwen3-ASR-0.6B':'SenseVoice INT8'}</Button>)}
 <p className={styles.muted}>当前模型：{report.speechEngine==='qwen3-asr'?'Qwen3-ASR-0.6B':'SenseVoice INT8'} · {report.speechReady?'已安装':'未就绪'}。选择后先验证本地解码，再用于下一次课堂。</p>
 <label className={styles.localInput}>语音识别模型
   <select aria-label="语音识别模型" disabled={disabled} value={speechChoice} onChange={event=>setSpeechChoice(event.target.value as SpeechEngine)}>
     <option value="sensevoice">SenseVoice INT8 · 轻量 CPU</option>
     <option value="qwen3-asr">Qwen3-ASR-0.6B · 增强识别</option>
   </select>
 </label>
 {speechChoice==='qwen3-asr'&&<label className={styles.localInput}>运行设备
   <select aria-label="转写运行设备" disabled={disabled} value={speechDevice} onChange={event=>setSpeechDevice(event.target.value as SpeechDevice)}>
     <option value="auto">自动 · 优先 NVIDIA GPU</option>
     <option value="cuda">NVIDIA GPU</option>
     <option value="cpu">CPU</option>
   </select>
 </label>}
 <p className={styles.muted}>{speechChoice==='qwen3-asr'
   ?'4GB 显存可先尝试小批量转写；请关闭占用较多内存或显存的程序，完成短录音测试后再用于整节课。CUDA 模式需要兼容的 NVIDIA 驱动。'
   :'使用 CPU 运行，适合低占用课堂转写。'}</p>
 <div className={styles.actions}>
   <Button disabled={disabled} onClick={()=>setInstall({name:speechChoice==='qwen3-asr'?'Qwen3-ASR-0.6B':'SenseVoice INT8',sizeGB:speechChoice==='qwen3-asr'?1.9:0.25})}>下载所选语音模型</Button>
   <Button variant="secondary" disabled={disabled||(speechChoice==='qwen3-asr'?!report.qwenSpeechReady:!(report.senseSpeechReady??report.speechReady))}
     onClick={()=>void run(()=>api.selectSpeech(speechChoice,speechChoice==='sensevoice'?'cpu':speechDevice))}>验证并使用此模型</Button>
   <Button variant="secondary" disabled={disabled} onClick={()=>void run(()=>api.importSpeech())}>导入 SenseVoice 目录</Button>
   <Button variant="secondary" disabled={disabled||!report.speechReady} onClick={()=>void run(()=>api.probeSpeech())}>转写模型自检</Button>
   <Button variant="secondary" disabled={disabled||!report.speechReady} onClick={()=>void run(()=>api.probeSpeech(true))}>短录音测试</Button>
 </div>
 <p className={styles.muted}>短录音测试使用当前模型，选择 1～30 秒 WAV 或 FLAC 文件。显示识别文字、推理用时和峰值分配显存；实时比小于 1 表示本次推理快于音频时长，模型加载时间另计。音频在本机处理。</p>
</>:<>
 <p className={styles.muted}>{report.running?`Ollama ${report.version} 已运行`:'本机 Ollama 未运行'}。所有文字 AI 功能共用保存后的模型，不会自动回退到在线 API。</p>
 {!report.running&&<div className={styles.actions}><Button disabled={disabled||!report.installed} onClick={()=>void run(async()=>{await api.start();await refresh();})}>启动 Ollama</Button><Button variant="secondary" onClick={()=>void window.maji?.external.open('https://ollama.com/download/windows')}>Ollama 官方安装页</Button></div>}
 <div className={styles.modelList}>{report.models.map(m=><article key={m.name}><div><strong>{m.name}{m.recommended?' · 本机已有模型首选（需自检）':''}</strong><small>{(m.size/1e9).toFixed(1)}GB · {m.remote?'云端或无法确认来源':m.capabilities.includes('completion')?'本地文字生成':'仅检索向量或其他能力'}</small></div><div className={styles.actions}><Button disabled={disabled||m.remote||!m.capabilities.includes('completion')} onClick={()=>onSelect(m.name)}>选择模型</Button><Button variant="secondary" disabled={disabled||m.remote||!m.capabilities.includes('completion')} onClick={()=>void run(async()=>setProbe(await api.probe(m.name)))}>生成自检</Button></div></article>)}</div>
 {report.models.length===0&&<p className={styles.muted}>暂无已安装模型，请先启动服务并下载。</p>}
 <details><summary>适配推荐与安装（不会自动下载）</summary><div className={styles.modelList}>{report.recommendations.map(m=><article key={m.name}><div><strong>{m.name}</strong><small>下载约 {m.sizeGB}GB · {m.reason}</small></div><Button disabled={disabled||!report.running} onClick={()=>setInstall(m)}>安装此模型</Button></article>)}</div></details>
 <div className={styles.actions}><Button variant="secondary" disabled={disabled||!report.running} onClick={()=>void run(()=>api.importGGUF())}>导入本地 GGUF 文件</Button></div>
 <details><summary>下载自定义 Ollama 模型</summary><label className={styles.localInput}>模型名称<input aria-label="自定义 Ollama 模型" value={custom} onChange={e=>setCustom(e.target.value)} placeholder="例如 qwen2.5:3b"/></label><Button disabled={disabled||!custom.trim()||!report.running} onClick={()=>setInstall({name:custom.trim(),sizeGB:0})}>确认下载…</Button></details>
 {probe&&<div className={probe.ok&&probe.jsonOK?styles.success:styles.error} role="status"><strong>{probe.model} · {(probe.latencyMs/1000).toFixed(1)} 秒</strong><p>{probe.message}</p><p>{probe.text}</p></div>}
 </>}
 </>}
 {job&&job.state!=='idle'&&<div className={job.state==='error'?styles.error:styles.muted} role="status"><strong>{job.kind}</strong><p>{job.message}</p>{job.progress!==null&&<progress max={100} value={job.progress}/>} {job.state==='running'&&<Button variant="secondary" onClick={()=>void run(()=>api.cancel())}>取消任务</Button>}{job.state==='done'&&<Button variant="secondary" onClick={()=>void run(refresh)}>刷新检测结果</Button>}</div>}
 {error&&<p className={styles.error} role="alert">{error}</p>}
 <Modal open={!!install} title="确认安装本地模型" onClose={()=>setInstall(null)} footer={<><Button variant="secondary" onClick={()=>setInstall(null)}>取消</Button><Button onClick={()=>{const target=install;setInstall(null);if(target)void run(()=>target.name==='SenseVoice INT8'?api.installSpeech():target.name==='Qwen3-ASR-0.6B'?api.installSpeech('qwen3-asr'):api.pull(target.name));}}>开始下载</Button></>}><p>{install?.name}</p><p>{install?.sizeGB?`模型文件约 ${install.sizeGB}GB，安装运行环境与缓存还需要额外空间。`:'此模型大小未知，请确认有足够磁盘空间。'}模型下载需要网络，安装后在本机推理。{install?.name==='Qwen3-ASR-0.6B'?'Qwen 会安装独立运行环境和 CUDA 组件，建议预留 15GB 磁盘空间（含下载缓存）。':''}下载完成后请刷新并运行自检，语音模型需要点击「验证并使用此模型」后生效。</p></Modal>
 </section>;
}
