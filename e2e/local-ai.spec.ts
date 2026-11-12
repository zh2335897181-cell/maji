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

test('语音设置支持 Qwen 下载、设备选择和短录音测试', async ({ page }, testInfo) => {
  await page.goto('/#/');
  await expect(page.getByRole('button', { name: '继续编辑' })).toBeVisible();
  await page.evaluate(() => {
    const report = {
      hardware: { cpu: 'i5-12500H', ramGB: 16, freeGB: 1.8, gpu: 'RTX 3050', vramGB: 4, diskFreeGB: 30 },
      installed: true, running: false, version: '', models: [], recommendations: [],
      speechReady: true, speechEngine: 'sensevoice', speechDevice: 'auto',
      qwenSpeechReady: true, senseSpeechReady: true, message: '',
      speechRuntimePath:'C:/models',speechUsedGB:3,speechFreeGB:20,speechInstallPending:['qwen3-asr'],
    };
    let job = { state: 'idle', kind: '', message: '', progress: null as number | null };
    Object.defineProperty(window, 'maji', { configurable: true, value: {
      ai: {
        getSettings: async () => ({ configured: false, keyPresent: false, model: '', baseUrl: '' }),
        local: {
          inspect: async () => report,
          job: async () => job,
          installSpeech: async (engine: string) => { document.body.dataset.installedSpeech = engine; },
          selectSpeech: async (engine: string, device: string) => {
            report.speechEngine = engine;
            report.speechDevice = device;
            document.body.dataset.selectedSpeech = JSON.stringify({ engine, device });
          },
          relocateSpeech:async()=>{report.speechRuntimePath='D:/models';document.body.dataset.relocated='true';},
          probeSpeech: async (audio: boolean) => {
            document.body.dataset.probedAudio = String(audio);
            job = { state: 'done', kind: '短录音转写测试', message: '音频 10 秒 · 推理 3 秒 · Spring Boot', progress: 100 };
            return job.message;
          },
        },
      },
    } });
  });
  await page.getByRole('button', { name: '小林（用户菜单）' }).click();
  await page.getByRole('menuitem', { name: 'AI 服务', exact: true }).click();
  await page.getByRole('tab', { name: '语音转写', exact: true }).click();
  await page.getByLabel('语音识别模型').selectOption('qwen3-asr');
  await page.getByLabel('转写运行设备').selectOption('cuda');
  await page.getByRole('button', { name: '下载所选语音模型' }).click();
  await page.getByRole('dialog', { name: '确认安装本地模型' }).getByRole('button', { name: '开始下载' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-installed-speech', 'qwen3-asr');
  await page.getByRole('button', { name: '验证并使用此模型' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-selected-speech', JSON.stringify({ engine: 'qwen3-asr', device: 'cuda' }));
  await page.getByRole('button', { name: '检测本机并刷新' }).click();
  await expect(page.getByText('当前模型：Qwen3-ASR-0.6B', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: '短录音测试' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-probed-audio', 'true');
  await expect(page.getByText('音频 10 秒 · 推理 3 秒 · Spring Boot')).toBeVisible();
  await page.getByRole('button',{name:'选择磁盘并迁移模型'}).click();
  await expect(page.locator('body')).toHaveAttribute('data-relocated','true');
  await page.getByRole('button',{name:'检测本机并刷新'}).click();
  await expect(page.getByText(/安装位置：D:\/models/)).toBeVisible();
  await page.getByRole('button',{name:'继续安装 Qwen3-ASR-0.6B'}).click();
  await page.screenshot({ path: testInfo.outputPath('qwen-settings.png') });
});
