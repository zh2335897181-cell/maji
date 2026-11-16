import {expect,it} from 'vitest';
import {validateModelLicense,licenseConflicts,requireCompatibleLicense} from './assistantLicense';
export const validLicense={type:'CC0-1.0',author:'作者',source:'https://example.com/avatar',evidence:'作者发布页明确声明此角色以 CC0 1.0 提供，可免费获取及使用。',attribution:'',changes:'未修改',free:true,commercial:true,derivatives:true,redistribution:true,confirmed:true,shareAlike:false};
it('accepts complete declarations while retaining that this is user declared',()=>{expect(validateModelLicense(validLicense).verification).toBe('user-declared');});
it.each(['free','commercial','derivatives','redistribution','confirmed'])('rejects missing permission %s',key=>{expect(()=>validateModelLicense({...validLicense,[key]:false})).toThrow();});
it('requires attribution and share-alike acknowledgement',()=>{
 expect(()=>validateModelLicense({...validLicense,type:'CC-BY-4.0'})).toThrow();
 expect(()=>validateModelLicense({...validLicense,type:'CC-BY-SA-4.0',attribution:'作者作品'})).toThrow();
 expect(validateModelLicense({...validLicense,type:'CC-BY-SA-4.0',attribution:'作者作品',shareAlike:true}).shareAlike).toBe(true);
});
it('rejects NC/ND and unknown licenses instead of certifying them',()=>{
 for(const type of ['CC-BY-NC-4.0','CC-BY-ND-4.0','unknown'])expect(()=>validateModelLicense({...validLicense,type})).toThrow();
 expect(()=>validateModelLicense({...validLicense,evidence:''})).toThrow();
});
it('detects explicit embedded VRM restrictions',()=>{
 expect(licenseConflicts({commercialUssageName:'Disallow',licenseName:'CC_BY_ND'})).toHaveLength(2);
 expect(licenseConflicts({commercialUsage:'personalNonProfit',modification:'prohibited',allowRedistribution:false})).toHaveLength(3);
 expect(licenseConflicts({licenseName:'CC0',commercialUssageName:'Allow',allowRedistribution:true})).toEqual([]);
});
it('does not confuse permission to modify with permission to redistribute modifications',()=>{expect(licenseConflicts({modification:'allowModification'})).toHaveLength(1);});
it('cannot replace embedded BY-SA with a CC0 checkbox declaration',()=>{expect(()=>requireCompatibleLicense(validateModelLicense(validLicense),{licenseName:'CC_BY_SA'})).toThrow();});
it('preserves attribution/share-alike regardless of the embedded license spelling or version',()=>{
 expect(()=>requireCompatibleLicense(validateModelLicense(validLicense),{licenseName:'CC-BY-SA-3.0'})).toThrow();
 const by=validateModelLicense({...validLicense,type:'CC-BY-4.0',attribution:'作者'});expect(()=>requireCompatibleLicense(by,{licenseName:'CC_BY',licenseUrl:'https://vrm.dev/licenses/1.0/',otherLicenseUrl:'https://creativecommons.org/licenses/by/3.0/'})).toThrow();
});
