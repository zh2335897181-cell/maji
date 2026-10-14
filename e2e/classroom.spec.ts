import { expect,test } from '@playwright/test';
test('原文每两分钟独立分组，组内从零计时并默认展开最新一组',async({page})=>{
 await page.goto('/#/');await expect(page.getByRole('button',{name:'继续编辑'})).toBeVisible();
 await page.evaluate(()=>{Object.defineProperty(window,'maji',{configurable:true,value:{classroom:{status:async()=>({installed:true,state:'recording',activeId:'class_group',error:'',device:''}),list:async()=>[{id:'class_group',title:'分组课堂',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),aiEnabled:false,chunks:[{start:0,end:20,text:'第一组原文'},{start:120,end:140,text:'第二组原文'},{start:240,end:260,text:'第三组原文'}],summaries:[]}]}}});});
 await page.getByRole('link',{name:'课堂纪要',exact:true}).click();
 const transcript=page.getByRole('region',{name:'分段转写原文',exact:true});
 await expect(transcript.locator('details')).toHaveCount(3);
 await expect(transcript.getByText('第一组原文',{exact:true})).toBeHidden();
 await expect(transcript.getByText('第三组原文',{exact:true})).toBeVisible();
 await expect(transcript.locator('details').last().locator('time')).toHaveText('00:00–00:20');
 await transcript.locator('details').nth(1).locator('summary').click();
 await expect(transcript.getByText('第二组原文',{exact:true})).toBeVisible();
 await expect(transcript.locator('details').nth(1).locator('time')).toHaveText('00:00–00:20');
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
