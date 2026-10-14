// Explicit installation verification; opens the installed app without starting a recording.
const {_electron,expect}=require('@playwright/test');
let application;
(async()=>{try{
 application=await _electron.launch({executablePath:'D:/111/maji/码迹.exe',args:[],env:{...process.env,ELECTRON_RUN_AS_NODE:undefined}});
 const page=await application.firstWindow();await page.waitForFunction(()=>!!window.maji?.classroom);
 await page.getByRole('link',{name:'课堂纪要',exact:true}).click();
 await expect(page.getByRole('heading',{name:'课堂纪要',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'开始课堂',exact:true})).toBeEnabled();
 const status=await page.evaluate(()=>window.maji.classroom.status());if(!status.installed)throw Error('Installed app did not find local model');
 console.log('PASS: installed desktop app has classroom module and ready local model; no recording or AI request started');
}finally{if(application)await application.close();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
