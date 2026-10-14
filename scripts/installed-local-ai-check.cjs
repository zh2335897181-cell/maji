// Verify the installed UI without changing the user's chosen AI provider or starting requests.
const {_electron,expect}=require('@playwright/test');let application;
(async()=>{try{
 application=await _electron.launch({executablePath:'D:/111/maji/码迹.exe',args:[],env:{...process.env,ELECTRON_RUN_AS_NODE:undefined}});
 const page=await application.firstWindow();await page.waitForFunction(()=>!!window.maji?.ai.local);
 await page.getByRole('button',{name:'小林（用户菜单）'}).click();await page.getByRole('menuitem',{name:'AI 服务',exact:true}).click();
 await page.getByRole('tab',{name:'本地文字模型',exact:true}).click();
 await expect(page.getByRole('article').filter({hasText:'qwen3.5:4b'}).getByRole('button',{name:'选择模型'})).toBeEnabled();
 await page.getByRole('tab',{name:'语音转写',exact:true}).click();await expect(page.getByRole('button',{name:'转写模型自检'})).toBeEnabled();
 console.log('PASS: installed AI settings contain local text models and ready local transcription; existing provider unchanged');
}finally{if(application)await application.close();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
