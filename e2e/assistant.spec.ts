import {test,expect} from '@playwright/test';
import {ASSISTANT_DEFAULTS} from '../src/lib/assistant';
test('桌面助手设置支持启用、导入角色与自定义性格',async({page},testInfo)=>{
 await page.addInitScript(defaults=>{
  const settings={...defaults,models:[...defaults.models]};
  const patch=async(value:object)=>{Object.assign(settings,value);localStorage.setItem('assistant-test',JSON.stringify(settings));return {...settings};};
  Object.defineProperty(window,'maji',{configurable:true,value:{assistant:{get:async()=>({...settings}),update:patch,prepareImport:async(kind:string)=>({token:'11111111-1111-4111-8111-111111111111',kind,name:'我的角色',file:'avatar.vrm',bytes:3000,fileCount:1,sha256:'a'.repeat(64),warnings:['VRM的表情取决于绑定'],conflicts:[]}),cancelImport:async()=>{},confirmImport:async(_token:string,name:string,license:object,activate:boolean)=>patch({modelId:activate?'pet-1':settings.modelId,models:[...defaults.models,{id:'pet-1',name,file:'avatar.vrm',kind:'vrm',license}]}),setModelLicense:async()=>({...settings}),show:async()=>{},hide:async()=>{}},external:{open:async()=>{}}}});
 },ASSISTANT_DEFAULTS);
 await page.goto('/#/');await page.getByRole('button',{name:'用户菜单'}).click();await page.getByRole('menuitem',{name:'桌面 AI 助手'}).click();
 const dialog=page.getByRole('dialog',{name:'桌面 AI 助手'});
 await dialog.getByLabel('启用桌面 AI 助手').check();
 await expect(dialog.getByLabel('当前角色')).toHaveValue('cosmic-bot');
 await dialog.getByRole('button',{name:'导入 2D / 3D 角色',exact:true}).click();
 const wizard=dialog.locator('section[aria-label="角色导入向导"]');
 await wizard.getByRole('button',{name:'选择文件并检查'}).click();
 await expect(wizard.getByRole('button',{name:'下一步：填写授权'})).toBeDisabled();
 await page.evaluate(()=>{const frame=document.querySelector('iframe[title="导入角色预览"]') as HTMLIFrameElement;window.dispatchEvent(new MessageEvent('message',{source:frame.contentWindow,origin:'maji-avatar://renderer',data:{type:'loaded'}}));});
 await wizard.getByRole('button',{name:'下一步：填写授权'}).click();
 await wizard.getByRole('button',{name:'下一步：确认保存'}).click();await expect(wizard.getByRole('alert')).toBeVisible();
 await wizard.getByLabel('许可类型').selectOption('CC0-1.0');await wizard.getByLabel('作者 / 权利人').fill('作者');await wizard.getByLabel('原始来源网址或本人原创说明').fill('https://example.com/model');await wizard.getByLabel('许可原文 / 授权依据',{exact:true}).fill('作者明确以CC0发布此素材，允许免费获取、商用、修改和再分发。');
 for(const label of ['素材为免费获取','原许可明确允许所需商业使用','原许可允许改编','原许可允许再分发','已核对作者'])await wizard.getByRole('checkbox',{name:new RegExp(label)}).check();
 await wizard.getByRole('button',{name:'下一步：确认保存'}).click();
 await wizard.getByText('核对后保存到本机').scrollIntoViewIfNeeded();await page.screenshot({path:testInfo.outputPath('import-confirmation.png')});
 await wizard.getByRole('button',{name:'确认导入',exact:true}).click();
 await expect(dialog.getByLabel('当前角色')).toHaveValue('cosmic-bot');await dialog.getByLabel('当前角色').selectOption('pet-1');

 await dialog.getByLabel('昵称',{exact:true}).fill('小迹');await dialog.getByLabel('性格与回复风格').fill('耐心解释 Java');await dialog.getByRole('button',{name:'保存昵称与性格'}).click();
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('assistant-test')!).name)).toBe('小迹');
 await dialog.getByText('桌面上的学习伙伴').scrollIntoViewIfNeeded();await page.screenshot({path:testInfo.outputPath('assistant-settings.png')});
});
test('限制授权不能推进，取消导入保留当前角色',async({page})=>{
 await page.addInitScript(defaults=>{
  Object.defineProperty(window,'maji',{configurable:true,value:{assistant:{get:async()=>defaults,prepareImport:async()=>({token:'11111111-1111-4111-8111-111111111111',kind:'vrm',name:'受限文件',file:'avatar.vrm',bytes:100,fileCount:1,sha256:'a'.repeat(64),warnings:[],conflicts:['模型内声明禁止商用']}),cancelImport:async()=>{localStorage.setItem('import-cancelled','yes');},confirmImport:async()=>{localStorage.setItem('unexpected-import','yes');return defaults;}}}});
 },ASSISTANT_DEFAULTS);
 await page.goto('/#/');await page.getByRole('button',{name:'用户菜单'}).click();await page.getByRole('menuitem',{name:'桌面 AI 助手'}).click();const dialog=page.getByRole('dialog',{name:'桌面 AI 助手'});
 await dialog.getByRole('button',{name:'导入 2D / 3D 角色'}).click();await dialog.getByRole('button',{name:'选择文件并检查'}).click();await expect(dialog.getByRole('alert')).toContainText('不能用勾选覆盖');await expect(dialog.getByRole('button',{name:'下一步：填写授权'})).toBeDisabled();
 await expect(dialog.locator('iframe')).toHaveCount(0);await dialog.getByRole('button',{name:'取消导入'}).click();await expect.poll(()=>page.evaluate(()=>localStorage.getItem('import-cancelled'))).toBe('yes');await expect(dialog.getByLabel('当前角色')).toHaveValue('cosmic-bot');expect(await page.evaluate(()=>localStorage.getItem('unexpected-import'))).toBeNull();
});
test('旧的未授权副本无需补充声明也能直接移除',async({page})=>{
 await page.addInitScript(defaults=>{
  let settings={...defaults,models:[...defaults.models,{id:'old-model',name:'未授权旧角色',file:'avatar.vrm',kind:'vrm'}]};
  Object.defineProperty(window,'maji',{configurable:true,value:{assistant:{get:async()=>settings,removeModel:async(id:string)=>{settings={...settings,models:settings.models.filter(m=>m.id!==id)};return settings;}}}});
 },ASSISTANT_DEFAULTS);
 await page.goto('/#/');await page.getByRole('button',{name:'用户菜单'}).click();await page.getByRole('menuitem',{name:'桌面 AI 助手'}).click();const dialog=page.getByRole('dialog',{name:'桌面 AI 助手'});
 await expect(dialog.getByRole('option',{name:/未授权旧角色/})).toHaveAttribute('disabled','');await dialog.getByText('未授权旧角色 · 来源与授权').click();await dialog.getByRole('button',{name:'移除 未授权旧角色 的副本'}).click();await expect(dialog.getByRole('option',{name:/未授权旧角色/})).toHaveCount(0);await expect(dialog.getByLabel('当前角色')).toHaveValue('cosmic-bot');
});
test('无模型也能对话，失败可重试并清空',async({page},testInfo)=>{
 await page.addInitScript(defaults=>{
  let failed=true;const history:{role:string;content:string}[]=[];
  Object.defineProperty(window,'assistant',{value:{get:async()=>({...defaults,enabled:true}),history:async()=>history,expand:async()=>{},show:async()=>{},hide:async()=>{},openSettings:async()=>{},clear:async()=>{history.length=0;},cancel:async()=>{},chat:async(text:string)=>{if(failed){failed=false;throw Error('请配置 AI 服务');}history.push({role:'user',content:text},{role:'assistant',content:'可以先明确类的职责，再逐步实现。'});return [...history];}}});
 },ASSISTANT_DEFAULTS);
 await page.goto('/assistant.html');await page.getByRole('button',{name:'和我聊聊'}).click();
 await page.getByLabel('发送给助手').fill('怎么学习 Java？');await page.getByRole('button',{name:'发送 ↑'}).click();
 await expect(page.getByRole('alert')).toHaveText('请配置 AI 服务');await expect(page.getByLabel('发送给助手')).toHaveValue('怎么学习 Java？');
 await page.getByRole('button',{name:'发送 ↑'}).click();await expect(page.getByText('可以先明确类的职责，再逐步实现。')).toBeVisible();
 await page.screenshot({path:testInfo.outputPath('assistant-chat.png')});
 await page.getByRole('button',{name:'清空',exact:true}).click();await expect(page.getByText('一起把问题想明白。')).toBeVisible();
});
