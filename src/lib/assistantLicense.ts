export const MODEL_LICENSE_TYPES=['CC0-1.0','CC-BY-4.0','CC-BY-SA-4.0','custom'] as const;
export interface ModelLicense {
 type:typeof MODEL_LICENSE_TYPES[number];author:string;source:string;licenseUrl:string;evidence:string;attribution:string;changes:string;
 free:boolean;commercial:boolean;derivatives:boolean;redistribution:boolean;confirmed:boolean;shareAlike:boolean;
 verification:'user-declared';version:1;
}
export const LICENSE_URLS:Record<string,string>={'CC0-1.0':'https://creativecommons.org/publicdomain/zero/1.0/','CC-BY-4.0':'https://creativecommons.org/licenses/by/4.0/','CC-BY-SA-4.0':'https://creativecommons.org/licenses/by-sa/4.0/'};
function field(value:unknown,label:string,min:number,max:number){if(typeof value!=='string'||value.trim().length<min||value.length>max)throw Error(`${label}需为 ${min}～${max} 个字符`);return value.trim();}
export function validateModelLicense(value:unknown):ModelLicense {
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('请填写模型授权记录');
 const input=value as Record<string,unknown>,type=input.type as ModelLicense['type'];
 if(!MODEL_LICENSE_TYPES.includes(type))throw Error('仅支持允许商用、改编和再分发的许可，不能使用 NC、ND 或未知许可');
 for(const key of ['free','commercial','derivatives','redistribution','confirmed'])if(input[key]!==true)throw Error('请逐项确认免费获取、商用、改编、再分发权限及授权依据');
 const author=field(input.author,'作者',1,200),source=field(input.source,'来源网址或原创说明',8,2000),evidence=field(input.evidence,'许可原文或授权依据',20,20000),changes=field(input.changes,'改动说明（未改请填未修改）',1,2000);
 const attribution=field(input.attribution??'','署名说明',type==='CC-BY-4.0'||type==='CC-BY-SA-4.0'?1:0,2000);
 let licenseUrl=LICENSE_URLS[type]??field(input.licenseUrl,'自定义许可网址',8,2000);
 try{const url=new URL(licenseUrl);if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw Error();licenseUrl=url.href;}catch{throw Error('许可网址必须是无凭证的 http(s) 地址');}
 if(type==='CC-BY-SA-4.0'&&input.shareAlike!==true)throw Error('需确认改编后对外分享时遵守相同方式共享条件');
 return {type,author,source,licenseUrl,evidence,attribution,changes,free:true,commercial:true,derivatives:true,redistribution:true,confirmed:true,shareAlike:input.shareAlike===true,verification:'user-declared',version:1};
}
export function licenseConflicts(meta:Record<string,unknown>|undefined):string[]{
 if(!meta)return [];
 const conflicts:string[]=[];
 if(meta.allowCommercialUse===false||meta.commercialUssageName==='Disallow'||(typeof meta.commercialUsage==='string'&&meta.commercialUsage!=='corporation'))conflicts.push('模型内声明禁止商用或仅允许受限商用');
 const code=typeof meta.licenseName==='string'?meta.licenseName.replace(/[^a-z0-9]/gi,'').toLowerCase():'';
 if((code.startsWith('cc')&&/nc|nd/.test(code))||meta.modification==='prohibited'||meta.modification==='DISALLOW'||meta.modification==='allowModification')conflicts.push('模型内声明禁止商用或分享改编作品（包含NC/ND或仅允许私下修改）');
 if(meta.allowRedistribution===false||code==='redistributionprohibited')conflicts.push('模型内声明禁止再分发');
 if((typeof meta.allowedUserName==='string'&&meta.allowedUserName!=='Everyone')||(typeof meta.avatarPermission==='string'&&meta.avatarPermission!=='everyone'))conflicts.push('模型内声明仅作者或特定人员可以使用');
 return conflicts;
}
export function requireCompatibleLicense(license:ModelLicense,claims?:Record<string,unknown>){
 const conflicts=licenseConflicts(claims);if(conflicts.length)throw Error(conflicts.join('；'));
 const code=typeof claims?.licenseName==='string'?claims.licenseName.replace(/[^a-z0-9]/gi,'').toLowerCase():'';
 const category=code.startsWith('cc0')?'CC0':code.startsWith('ccbysa')?'BY-SA':code.startsWith('ccby')?'BY':null;
 if(category==='CC0'&&license.type!=='CC0-1.0')throw Error('不能覆盖内嵌CC0声明，请核对原始授权');
 if(category==='BY-SA'&&!['CC-BY-SA-4.0','custom'].includes(license.type)||category==='BY'&&!['CC-BY-4.0','custom'].includes(license.type))throw Error('所选许可不能覆盖内嵌的署名/共享条件');
 if((category==='BY'||category==='BY-SA')&&!license.attribution)throw Error('内嵌许可要求保留署名');
 if(category==='BY-SA'&&!license.shareAlike)throw Error('内嵌许可要求相同方式共享，请确认共享义务');
 const sourceVersion=[claims?.licenseUrl,claims?.otherLicenseUrl].map(url=>String(url??'').match(/creativecommons\.org\/licenses\/by(?:-sa)?\/(\d\.\d)/)?.[1]).find(Boolean)??String(claims?.licenseName??'').match(/([1-9])\.([0-9])$/)?.slice(1).join('.');
 if(license.type!=='custom'&&category!=='CC0'&&sourceVersion&&sourceVersion!=='4.0')throw Error('原许可版本不是4.0，不能自动升级；请用自定义许可保留原版本与条件');
 if(typeof claims?.creditNotation==='string'&&claims.creditNotation.toLowerCase()==='required'&&!license.attribution)throw Error('内嵌许可要求署名，请填写署名说明');
}
