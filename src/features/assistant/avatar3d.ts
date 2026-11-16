import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {VRMLoaderPlugin,VRMUtils,type VRM} from '@pixiv/three-vrm';
import {avatarSource} from './avatarSource';
import {reportAvatar} from './avatarReport';
let renderer:THREE.WebGLRenderer|undefined,vrm:VRM|undefined,root:THREE.Object3D|undefined,mixer:THREE.AnimationMixer|undefined;
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(32,1,.01,100),look=new THREE.Object3D(),clips=new Map<string,THREE.AnimationClip>();
let follow=true,pointer={x:0,y:0},gesture='',gestureStart=0,emotion='',reactUntil=0,last=0,elapsed=0,frame=0;
const send=reportAvatar;
const fail=(error:unknown)=>send({type:'error',message:'角色加载失败：'+(error instanceof Error?error.message:String(error)).slice(0,300)});
let height=1;const center=new THREE.Vector3(),size=new THREE.Vector3();
function fit(){
 if(!renderer||!root)return;renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/Math.max(1,innerHeight);
 const tan=Math.tan(THREE.MathUtils.degToRad(camera.fov/2)),distance=Math.max(size.y/(2*tan),size.x/(2*tan*camera.aspect))*1.12+size.z/2;
 camera.position.set(center.x,center.y,center.z+Math.max(distance,.1));camera.near=Math.max(.001,distance/1000);camera.far=Math.max(100,distance*10);camera.lookAt(center);camera.updateProjectionMatrix();
}
async function start(){
 const source=avatarSource();renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});
 renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setClearColor(0,0);renderer.outputColorSpace=THREE.SRGBColorSpace;document.body.appendChild(renderer.domElement);
 scene.add(new THREE.HemisphereLight(0xffffff,0xa6b8c9,2.2));const light=new THREE.DirectionalLight(0xffffff,2.4);light.position.set(1,2,3);scene.add(light);scene.add(look);
 const loader=new GLTFLoader();if(source.kind==='vrm')loader.register(parser=>new VRMLoaderPlugin(parser));
 const gltf=await loader.loadAsync(source.url);
 if(source.kind==='vrm'){
  vrm=gltf.userData.vrm as VRM|undefined;if(!vrm)throw Error('文件未包含可渲染的 VRM 角色');
  VRMUtils.rotateVRM0(vrm);root=vrm.scene;
  const left=vrm.humanoid.getNormalizedBoneNode('leftUpperArm'),right=vrm.humanoid.getNormalizedBoneNode('rightUpperArm');if(left)left.rotation.z=1.15;if(right)right.rotation.z=-1.15;vrm.update(0);
 }else{
  root=gltf.scene;mixer=new THREE.AnimationMixer(root);gltf.animations.slice(0,128).forEach((clip,index)=>clips.set(`${index+1}. ${clip.name.slice(0,80)||'动画'}`,clip));
 }
 scene.add(root);root.updateMatrixWorld(true);root.traverse(object=>{if((object as THREE.SkinnedMesh).isSkinnedMesh)(object as THREE.SkinnedMesh).skeleton.update();});
 const box=new THREE.Box3().setFromObject(root,true);box.getSize(size);box.getCenter(center);height=size.y;
 if(!Number.isFinite(size.length())||size.length()<.000001)throw Error('模型没有可显示的几何体');fit();
 look.position.set(center.x,center.y+height*.3,center.z+2);if(vrm?.lookAt)vrm.lookAt.target=look;
 renderer.domElement.addEventListener('click',()=>{send({type:'tap'});if(vrm){gesture='挥手';gestureStart=elapsed;}});
 renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();cancelAnimationFrame(frame);fail(Error('显卡上下文中断，请重新加载角色'));});
 renderer.render(scene,camera);
 send({type:'loaded',expressions:(vrm?.expressionManager?.expressions??[]).map(e=>e.expressionName).filter(n=>!/^look|blink|aa$|ih$|ou$|ee$|oh$/i.test(n)),motions:vrm?['挥手','点头']:[...clips.keys()]});
 frame=requestAnimationFrame(animate);
}
function animate(now:number){
 frame=requestAnimationFrame(animate);if(!renderer||!root||document.hidden||now-last<1000/30)return;
 const delta=Math.min((now-last)/1000,.1);last=now;elapsed+=delta;mixer?.update(delta);
 if(vrm){
  const x=follow?pointer.x:0,y=follow?pointer.y:0;look.position.lerp(new THREE.Vector3(center.x+x*height*.5,center.y+height*.3+y*height*.2,center.z+2),.12);
  const head=vrm.humanoid.getNormalizedBoneNode('head');if(head){head.rotation.y=THREE.MathUtils.lerp(head.rotation.y,x*.22,.1);head.rotation.x=THREE.MathUtils.lerp(head.rotation.x,-y*.12,.1);if(gesture==='点头'&&elapsed-gestureStart<2)head.rotation.x+=Math.sin((elapsed-gestureStart)*8)*.025;}
  const arm=vrm.humanoid.getNormalizedBoneNode('rightUpperArm'),forearm=vrm.humanoid.getNormalizedBoneNode('rightLowerArm'),waving=gesture==='挥手'&&elapsed-gestureStart<2;
  if(arm)arm.rotation.z=THREE.MathUtils.lerp(arm.rotation.z,waving ? .35 : -1.15,.12);if(forearm)forearm.rotation.x=THREE.MathUtils.lerp(forearm.rotation.x,waving?-1.4+Math.sin(elapsed*10)*.3:0,.15);
  const chest=vrm.humanoid.getNormalizedBoneNode('chest');if(chest)chest.rotation.x=Math.sin(elapsed*1.7)*.012;
  const em=vrm.expressionManager;if(em){em.setValue('blink',Math.max(0,1-Math.abs((elapsed%4.5)-4.25)/.12));for(const e of em.expressions){if(/^look|blink/i.test(e.expressionName))continue;em.setValue(e.expressionName,e.expressionName===(elapsed<reactUntil?'happy':emotion)?1:0);}}
  vrm.update(delta);
 }
 renderer.render(scene,camera);
}
window.addEventListener('resize',fit);
window.addEventListener('message',event=>{
 if(event.source!==parent)return;const value=event.data;if(!value||typeof value!=='object')return;
 if(value.type==='load')follow=value.settings?.followMouse===true;if(value.type==='follow')follow=value.enabled===true;
 if(value.type==='pointer'&&Number.isFinite(value.x)&&Number.isFinite(value.y))pointer={x:THREE.MathUtils.clamp(value.x/Math.max(1,innerWidth)*2-1,-1,1),y:THREE.MathUtils.clamp(1-value.y/Math.max(1,innerHeight)*2,-1,1)};
 if(value.type==='expression'&&typeof value.name==='string')emotion=value.name;
 if(value.type==='motion'){
  if(vrm&&['挥手','点头'].includes(value.name)){gesture=value.name;gestureStart=elapsed;}
  const clip=clips.get(value.name);if(clip&&mixer){mixer.stopAllAction();mixer.clipAction(clip).reset().play();}
 }
 if(value.type==='react'&&vrm){reactUntil=elapsed+2;gesture='点头';gestureStart=elapsed;}
});
window.addEventListener('beforeunload',()=>{cancelAnimationFrame(frame);mixer?.stopAllAction();if(root)VRMUtils.deepDispose(root);renderer?.dispose();renderer?.forceContextLoss();});
send({type:'ready'});void start().catch(fail);
