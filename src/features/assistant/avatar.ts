// Each renderer is loaded only for its supported kind, without any application bridge.
import {avatarSource} from './avatarSource';
import {reportAvatar} from './avatarReport';
try{
 const source=avatarSource();
 void (source.kind==='image2d'||source.kind==='puppet2d'?import('./avatar2d'):import('./avatar3d')).catch(error=>reportAvatar({type:'error',message:'角色加载失败：'+String(error)}));
}catch(error){reportAvatar({type:'error',message:String(error)});}
