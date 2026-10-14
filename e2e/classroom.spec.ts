import { expect,test } from '@playwright/test';
test('编辑课堂标题知识点原文并确认删除',async({page})=>{
 await page.goto('/#/');await expect(page.getByRole('button',{name:'继续编辑'})).toBeVisible();
 await page.evaluate(()=>{let row:any={id:'class_edit',title:'原课堂',createdAt:new Date().toISOString(),updatedAt:'initial',aiEnabled:true,chunks:[{start:0,end:20,text:'原转写'}],summaries:[{start:0,end:120,text:'原知识点'}]};Object.defineProperty(window,'maji',{configurable:true,value:{classroom:{status:async()=>({installed:true,state:'idle',activeId:null,error:'',device:''}),list:async()=>row?[row]:[],update:async(_id:string,patch:any)=>{row={...row,title:patch.title,chunks:[{...row.chunks[0],text:patch.chunkTexts[0]}],summaries:[{...row.summaries[0],text:patch.summaryTexts[0]}],updatedAt:'edited'};},remove:async()=>{row=null;}}}});});
 await page.getByRole('link',{name:'课堂纪要',exact:true}).click();await page.getByRole('button',{name:'编辑课堂',exact:true}).click();
 const dialog=page.getByRole('dialog');await dialog.getByRole('textbox',{name:'课堂标题',exact:true}).fill('修改课堂');await dialog.getByRole('textbox',{name:'知识点 00:00–02:00',exact:true}).fill('修改知识点');await dialog.getByRole('textbox',{name:'原文 00:00–00:20',exact:true}).fill('纠正原文');
 await dialog.getByRole('button',{name:'保存修改',exact:true}).click();await expect(page.getByRole('heading',{name:'修改课堂',exact:true})).toBeVisible();await expect(page.getByRole('article')).toContainText('修改知识点');await page.getByText('查看本段原文',{exact:true}).click();await expect(page.getByRole('article')).toContainText('纠正原文');
 await page.getByRole('button',{name:'删除课堂',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'取消',exact:true}).click();await expect(page.getByRole('heading',{name:'修改课堂',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'删除课堂',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('总结笔记将保留');await page.getByRole('dialog').getByRole('button',{name:'确认删除',exact:true}).click();await expect(page.getByRole('heading',{name:'把课堂重点留下来',exact:true})).toBeVisible();
});
test('悬浮页面只展示最新知识点，新一段替换旧内容',async({page})=>{
 await page.goto('/#/');await expect(page.getByRole('button',{name:'继续编辑'})).toBeVisible();
 await page.evaluate(()=>{(window as any).floatSummary={start:0,end:120,text:'第一段知识点'};Object.defineProperty(window,'maji',{configurable:true,value:{classroom:{floating:async()=>({title:'课堂',state:'recording',summary:(window as any).floatSummary}),restoreMain:async()=>{},hideFloating:async()=>{}}}});location.hash='/classroom-floating';});
 await page.setViewportSize({width:340,height:300});await expect(page.getByText('第一段知识点',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'恢复主窗口',exact:true})).toBeVisible();await expect(page.getByText('转写原文',{exact:true})).toHaveCount(0);
 await page.evaluate(()=>(window as any).floatSummary={start:120,end:240,text:'第二段知识点'});await expect(page.getByText('第二段知识点',{exact:true})).toBeVisible();await expect(page.getByText('第一段知识点',{exact:true})).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('整堂课总结提供可复制的 Markdown 和笔记入口',async({page})=>{
 await page.goto('/#/');await expect(page.getByRole('button',{name:'继续编辑'})).toBeVisible();
 await page.evaluate(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async(text:string)=>{(window as unknown as {copiedMarkdown:string}).copiedMarkdown=text;}}});Object.defineProperty(window,'maji',{configurable:true,value:{classroom:{status:async()=>({installed:true,state:'idle',activeId:null,error:'',device:''}),list:async()=>[{id:'class_final',title:'整堂课',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),aiEnabled:true,chunks:[{start:0,end:20,text:'原文'}],summaries:[],finalSummary:{markdown:'# 课堂知识点\n\n- 构造器注入',noteId:'note_final'}}]}}});});
 await page.getByRole('link',{name:'课堂纪要',exact:true}).click();
 await expect(page.getByRole('article',{name:'整堂课知识点总结'})).toContainText('构造器注入');
 await page.getByRole('button',{name:'复制 Markdown',exact:true}).click();
 await expect(page.getByRole('button',{name:'已复制 Markdown',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>(window as unknown as {copiedMarkdown:string}).copiedMarkdown)).toBe('# 课堂知识点\n\n- 构造器注入');
 await expect(page.getByRole('button',{name:'打开总结笔记',exact:true})).toBeVisible();
});
test('暂停和继续同一课堂，并允许暂停时结束',async({page})=>{
 await page.goto('/#/');await expect(page.getByRole('button',{name:'继续编辑'})).toBeVisible();
 await page.evaluate(()=>{let state='recording';Object.defineProperty(window,'maji',{configurable:true,value:{classroom:{status:async()=>({installed:true,state,activeId:state==='idle'?null:'class_pause',error:'',device:''}),list:async()=>[{id:'class_pause',title:'暂停课堂',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),aiEnabled:false,chunks:[],summaries:[]}],pause:async()=>{state='paused';},resume:async()=>{state='recording';},stop:async()=>{state='idle';}}}});});
 await page.getByRole('link',{name:'课堂纪要',exact:true}).click();
 await page.getByRole('button',{name:'暂停转录',exact:true}).click();
 await expect(page.getByRole('status').filter({hasText:'SenseVoice'})).toContainText('已暂停');
 await page.getByRole('button',{name:'继续转录',exact:true}).click();
 await expect(page.getByRole('status').filter({hasText:'SenseVoice'})).toContainText('正在录音与转写');
 await expect(page.getByRole('heading',{name:'暂停课堂',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'暂停转录',exact:true}).click();
 await expect(page.getByRole('button',{name:'继续转录',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'结束课堂',exact:true}).click();
 await expect(page.getByRole('status').filter({hasText:'SenseVoice'})).toContainText('未在录音');
 await expect(page.getByRole('button',{name:'继续转录',exact:true})).toHaveCount(0);
});
test('每两分钟只保留一张卡片，原文时间归零且无重复底部区域',async({page})=>{
 await page.goto('/#/');await expect(page.getByRole('button',{name:'继续编辑'})).toBeVisible();
 await page.evaluate(()=>{Object.defineProperty(window,'maji',{configurable:true,value:{classroom:{status:async()=>({installed:true,state:'recording',activeId:'class_group',error:'',device:''}),list:async()=>[{id:'class_group',title:'分组课堂',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),aiEnabled:false,chunks:[{start:0,end:20,text:'第一组原文'},{start:120,end:140,text:'第二组原文'},{start:240,end:260,text:'第三组原文'}],summaries:[]}]}}});});
 await page.getByRole('link',{name:'课堂纪要',exact:true}).click();
 const transcript=page.locator('main').last();
 await expect(page.getByRole('region',{name:'分段转写原文',exact:true})).toHaveCount(0);
 await expect(transcript.getByRole('article')).toHaveCount(3);
 await expect(transcript.getByText('第一组原文',{exact:false})).toBeHidden();
 await transcript.locator('details').last().locator('summary').click();
 await expect(transcript.getByText('第三组原文',{exact:false})).toBeVisible();
 await expect(transcript.locator('details').last().locator('time')).toHaveText('00:00');
 await transcript.locator('details').nth(1).locator('summary').click();
 await expect(transcript.getByText('第二组原文',{exact:false})).toBeVisible();
 await expect(transcript.locator('details').nth(1).locator('time')).toHaveText('00:00');
});
test('独立课堂入口、简短纪要及原文展开',async({page})=>{
 await page.goto('/#/');await expect(page.getByRole('button',{name:'继续编辑'})).toBeVisible();
 await page.evaluate(()=>{Object.defineProperty(window,'maji',{configurable:true,value:{classroom:{status:async()=>({installed:true,state:'idle',activeId:null,error:'',device:''}),list:async()=>[{id:'class_test',title:'Spring课堂',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),aiEnabled:true,chunks:[{start:0,end:120,text:'老师介绍构造器注入的完整原文'}],summaries:[{start:0,end:120,text:'• 单构造器可省略 @Autowired。\n• final 字段可配合 Lombok 生成构造器。'}]}]}}});});
 await page.getByRole('link',{name:'课堂纪要',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Spring课堂'})).toBeVisible();
 await expect(page.getByRole('article').getByText('00:00–02:00',{exact:true})).toBeVisible();
 await page.getByText('查看本段原文',{exact:true}).click();await expect(page.getByText('老师介绍构造器注入的完整原文',{exact:false}).first()).toBeVisible();
 await page.getByRole('button',{name:'开始课堂',exact:true}).click();
 await expect(page.getByRole('dialog')).toContainText('80～150');await expect(page.getByRole('dialog')).toContainText('不上传音频');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
