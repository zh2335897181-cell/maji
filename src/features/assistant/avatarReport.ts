export function reportAvatar(value:{type:string;[key:string]:unknown}){
 if(new URL(location.href).searchParams.has('draft')&&['loaded','error'].includes(value.type))console.info('maji:avatar:preview:'+value.type);
 parent.postMessage(value,'*');
}
