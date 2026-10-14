import {expect,test} from '@playwright/test';
test('本地模型与语音独立管理，选择后无需密钥并保存全局来源',async({page})=>{
 await page.goto('/#/');await expect(page.getByRole('button',{name:'继续编辑'})).toBeVisible();
 await page.evaluate(()=>{
  const status={baseUrl:'https://api.example.com/v1',model:'online',configured:true,keyPresent:true};
  Object.defineProperty(window,'maji',{configurable:true,value:{ai:{getSettings:async()=>status,saveSettings:async(settings:any)=>{localStorage.setItem('qa-ai-settings',JSON.stringify(settings));return {...settings,configured:true,keyPresent:false};},testConnection:async()=>{},local:{
    inspect:async()=>({hardware:{cpu:'i5',ramGB:16,freeGB:8,gpu:'RTX3050',vramGB:4,diskFreeGB:20},installed:true,running:true,version:'test',models:[{name:'qwen3.5:4b',size:3.4e9,capabilities:['completion'],remote:false,recommended:true},{name:'bge-m3',size:1.2e9,capabilities:['embedding'],remote:false}],recommendations:[{name:'qwen3:4b-instruct-2507-q4_K_M',sizeGB:2.5,reason:'资源估算'}],speechReady:true,message:''}),job:async()=>({state:'idle',kind:'',message:'',progress:null}),probe:async()=>({ok:true,jsonOK:true,model:'qwen3.5:4b',latencyMs:500,text:'测试输出',message:'自检通过'}),probeSpeech:async()=> '通过',importAPI:async()=>({settings:{baseUrl:'https://api.deepseek.com/v1',model:'deepseek-chat',provider:'api'}})
  }}}});
 });
 await page.getByRole('button',{name:'小林（用户菜单）'}).click();await page.getByRole('menuitem',{name:'AI 服务',exact:true}).click();
 await page.getByRole('tab',{name:'本地文字模型',exact:true}).click();
 const qwen=page.getByRole('article').filter({hasText:'qwen3.5:4b'}),embedding=page.getByRole('article').filter({hasText:'bge-m3'});
 await expect(embedding.getByRole('button',{name:'选择模型'})).toBeDisabled();
 await qwen.getByRole('button',{name:'生成自检'}).click();await expect(page.getByText('测试输出',{exact:true})).toBeVisible();
 await qwen.getByRole('button',{name:'选择模型'}).click();await expect(page.getByLabel('API 密钥')).toHaveCount(0);
 await page.getByRole('button',{name:'保存 AI 设置'}).click();expect(JSON.parse(await page.evaluate(()=>localStorage.getItem('qa-ai-settings')!)).provider).toBe('local');
 await page.getByRole('tab',{name:'语音转写',exact:true}).click();await expect(page.getByRole('button',{name:'转写模型自检'})).toBeEnabled();
 await page.getByRole('tab',{name:'在线 API',exact:true}).click();await page.getByRole('button',{name:'导入 API 配置 JSON'}).click();await expect(page.getByLabel('模型名称')).toHaveValue('deepseek-chat');
});
