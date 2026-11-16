import {avatarSource} from './avatarSource';
import type {Puppet2D} from '../../lib/assistant';
import {reportAvatar} from './avatarReport';
const send=reportAvatar,source=avatarSource();
const outer=document.createElement('div'),stage=document.createElement('div');
document.body.appendChild(outer);outer.appendChild(stage);
Object.assign(outer.style,{position:'absolute',inset:'0',display:'grid',placeItems:'center',overflow:'hidden',cursor:'pointer'});
Object.assign(stage.style,{position:'absolute',transformOrigin:'50% 50%'});
let puppet:Puppet2D|undefined,width=1,height=1,follow=true,x=0,y=0,elapsed=0,last=0,frame=0,motion='',motionAt=0,scale=1;
const images=new Map<string,HTMLImageElement>(),defaults=new Map<string,string>();
function fit(){scale=Math.min(innerWidth/width,innerHeight/height)*.96;stage.style.width=width+'px';stage.style.height=height+'px';stage.style.left=(innerWidth-width*scale)/2+'px';stage.style.top=(innerHeight-height*scale)/2+'px';stage.style.transformOrigin='0 0';}
function path(file:string){if(!/^(?:avatar\.(?:png|gif|webp)|asset-\d+\.(?:png|gif|webp))$/.test(file))throw Error('图片路径无效');return source.base+file;}
async function loadImage(file:string){const image=new Image();image.src=path(file);await image.decode();return image;}
function expression(name:string){for(const [id,image]of images)image.src=path(defaults.get(id)!);for(const [id,file]of Object.entries(puppet?.expressions.find(e=>e.name===name)?.files??{})){const image=images.get(id);if(image)image.src=path(file);}}
async function start(){
 if(source.kind==='image2d'){
  const file=source.url.split('/').at(-1)!,image=await loadImage(file);width=image.naturalWidth;height=image.naturalHeight;Object.assign(image.style,{width:'100%',height:'100%',objectFit:'contain'});stage.appendChild(image);
 }else{
  const response=await fetch(source.url);if(!response.ok)throw Error('分层描述无法读取');puppet=await response.json() as Puppet2D;
  if(puppet.version!==1||!Number.isFinite(puppet.width)||!Number.isFinite(puppet.height)||!Array.isArray(puppet.layers)||puppet.layers.length>32)throw Error('分层格式无效');
  width=puppet.width;height=puppet.height;
  const assets=new Set<string>();for(const layer of puppet.layers)assets.add(layer.file);for(const exp of puppet.expressions)for(const file of Object.values(exp.files))assets.add(file);await Promise.all([...assets].map(file=>loadImage(file)));
  for(const layer of puppet.layers){
   const image=await loadImage(layer.file);images.set(layer.id,image);defaults.set(layer.id,layer.file);image.dataset.role=layer.role;
   Object.assign(image.style,{position:'absolute',left:layer.x+'px',top:layer.y+'px',width:layer.width+'px',height:layer.height+'px',objectFit:'contain',transformOrigin:'50% 50%'});
   // Preserve author-defined layer ordering; each bound part transforms independently.
   stage.appendChild(image);
  }
 }
 fit();outer.addEventListener('click',()=>{send({type:'tap'});motion='跳跃';motionAt=elapsed;});
 send({type:'loaded',expressions:puppet?.expressions.map(e=>e.name)??[],motions:puppet?.layers.some(l=>l.role==='head')?['点头','轻摆']:['轻摆','跳跃']});frame=requestAnimationFrame(animate);
}
function animate(now:number){
 frame=requestAnimationFrame(animate);if(document.hidden||now-last<1000/30)return;elapsed+=Math.min((now-last)/1000,.1);last=now;
 const t=elapsed-motionAt,active=t<1.7,sway=motion==='轻摆'&&active?Math.sin(t*6)*4:Math.sin(elapsed*1.2)*.4,jump=motion==='跳跃'&&active?-Math.abs(Math.sin(t*5))*height*.035:0;
 stage.style.transform=`scale(${scale}) translateY(${jump}px) rotate(${sway}deg) scaleY(${1+Math.sin(elapsed*1.5)*.003})`;
 for(const image of images.values()){
  const role=image.dataset.role,headPart=['head','eyes','mouth'].includes(role??'');let transform='';
  if(headPart)transform=`translate(${follow?x*width*.007:0}px,${follow?y*height*.004:0}px) rotate(${motion==='点头'&&active?Math.sin(t*7)*3:0}deg)`;
  if(role==='eyes')transform+=` scaleY(${Math.max(.08,1-Math.max(0,1-Math.abs((elapsed%4.5)-4.25)/.12))})`;
  image.style.transform=transform;
 }
}
window.addEventListener('resize',fit);
window.addEventListener('message',event=>{
 if(event.source!==parent)return;const value=event.data;if(!value||typeof value!=='object')return;
 if(value.type==='load')follow=value.settings?.followMouse===true;if(value.type==='follow')follow=value.enabled===true;
 if(value.type==='pointer'&&Number.isFinite(value.x)&&Number.isFinite(value.y)){x=Math.max(-1,Math.min(1,value.x/Math.max(1,innerWidth)*2-1));y=Math.max(-1,Math.min(1,value.y/Math.max(1,innerHeight)*2-1));}
 if(value.type==='expression'&&typeof value.name==='string')expression(value.name);
 if(value.type==='motion'&&['点头','轻摆','跳跃'].includes(value.name)){motion=value.name;motionAt=elapsed;}
 if(value.type==='react'){motion='跳跃';motionAt=elapsed;}
});
window.addEventListener('beforeunload',()=>cancelAnimationFrame(frame));
send({type:'ready'});void start().catch(error=>send({type:'error',message:'2D角色加载失败：'+String(error)}));
