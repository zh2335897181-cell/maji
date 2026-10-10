// Run after `npm run build`. Uses a separate temporary profile; never opens personal data.
const { _electron, expect } = require('@playwright/test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'maji-backup-qa-'));
const wrapper = path.join(profile, 'wrapper.cjs');
fs.writeFileSync(wrapper, `const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(profile)});BrowserWindow.prototype.show=function(){};require(${JSON.stringify(path.join(root,'dist-electron/electron/main/index.js'))});`);
const launch = () => _electron.launch({executablePath:path.join(root,'node_modules/electron/dist/electron.exe'),args:[wrapper],env:{...process.env,ELECTRON_RUN_AS_NODE:undefined}});
let app;
async function shutdown() {
  if (!app) return;
  await app.evaluate(({app},root)=>{process.getBuiltinModule('module').createRequire(root+'/package.json')(root+'/dist-electron/electron/main/db/connection.js').closeDatabase();app.exit(0);},root).catch(()=>{});
  await app.close().catch(()=>{});
}
(async () => {
  try {
    app=await launch(); let page=await app.firstWindow();
    console.log('Native: launched');
    await page.waitForFunction(()=>!!window.maji?.backup);
    await page.evaluate(async()=>{
      await window.maji.morningNotes.create({date:'2026-10-11',title:'备份验收晨考',contentJson:'{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"IOC 答案"}]}]}'});
      const map = await window.maji.mindMaps.save({title:'备份验收导图',rootId:'root',nodes:[{id:'root',parentId:null,title:'IOC',description:'容器管理对象',kind:'concept',sourceRefs:[],isSupplement:false,codeExamples:[]}],relations:[],sources:[],options:{depth:'standard',organization:'knowledge',includeCode:true,highlightPitfalls:true,allowSupplement:false}});
      await window.maji.mindMaps.saveView(map.id,{collapsedIds:[],x:10,y:20,zoom:1});
      const session=await window.maji.reviewSessions.create({scope:'notes',depth:'standard',plannedQuestionCount:1,sources:[{noteId:'note_func_args',noteTitle:'函数',courseName:'Python',contentExcerpt:'函数可以接收参数',reviewItemIds:[]}],questions:[{type:'concept',difficulty:'easy',title:'参数是什么',prompt:'解释参数',hint:'',referenceAnswer:'传入函数的数据',explanation:'通过参数提供输入',language:'python',sourceNoteId:'note_func_args'}]});
      await window.maji.reviewSessions.saveAnswer(session.id,{questionId:session.questions[0].id,answer:'传入的数据'});
      await window.maji.reviewSessions.saveGrade(session.id,{questionId:session.questions[0].id,grade:{score:90,rationale:'理解正确',omissions:[],feedback:'继续练习',referenceAnswer:'传入函数的数据',explanation:'通过参数提供输入'}});
    });
    console.log('Native: fixtures saved');
    const setup=await app.evaluate(({app,dialog},root)=>{
      const req=process.getBuiltinModule('module').createRequire(root+'/package.json');
      const db=req(root+'/dist-electron/electron/main/db/connection.js').getDb();
      const format=req(root+'/dist-electron/electron/main/backup/format.js');
      const file=req('node:path').join(app.getPath('userData'),'manual.json');
      dialog.showSaveDialog=async()=>({canceled:false,filePath:file});
      dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});
      return {snapshot:format.readSnapshot(db),file, mocked:String(dialog.showSaveDialog)};
    },root);
    for(const table of ['courses','notes','snippets','exercises','review_items','review_sessions','review_questions','mind_maps','mind_map_views','morning_notes'])assert(setup.snapshot[table].length>0,table);
    console.log('Native: dialog mocked',setup.mocked);
    await page.evaluate(async()=>{await window.maji.settings.update({autoSaveDelayMs:1500});window.location.hash='/notes/note_func_args';});
    await page.getByLabel('笔记标题',{exact:true}).fill('最后一次输入也要备份');
    await page.getByRole('button',{name:'用户菜单'}).click();
    await page.getByRole('menuitem',{name:'偏好设置'}).click();
    await page.getByRole('button',{name:'导出备份',exact:true}).click();
    await expect(page.getByRole('status').filter({hasText:'备份已导出'})).toBeVisible();
    await page.keyboard.press('Escape');
    console.log('Native: exported');
    const parsed=JSON.parse(fs.readFileSync(setup.file,'utf8'));assert(!('settings' in parsed.tables));
    assert.equal(parsed.tables.notes.find(n=>n.id==='note_func_args').title,'最后一次输入也要备份');
    setup.snapshot=parsed.tables;
    await page.evaluate(()=>{window.location.hash='/';});
    await expect(page.getByLabel('笔记标题',{exact:true})).toHaveCount(0);
    await page.evaluate(()=>window.maji.notes.update('note_func_args',{title:'恢复前修改'}));
    const preview=await page.evaluate(()=>window.maji.backup.preview());
    console.log('Native: previewed');
    assert.equal(preview.counts.morning_notes,1);
    const loaded=page.waitForEvent('load');
    await page.evaluate(token=>window.maji.backup.restore(token),preview.token).catch(e=>{if(!/context.*destroyed/i.test(e.message))throw e;});
    await loaded;
    await page.waitForFunction(()=>!!window.maji?.backup);
    console.log('Native: restored');
    await expect.poll(()=>page.evaluate(()=>window.maji.notes.get('note_func_args').then(n=>n.title))).toBe(setup.snapshot.notes.find(n=>n.id==='note_func_args').title);
    const restored=await app.evaluate(({},root)=>{const req=process.getBuiltinModule('module').createRequire(root+'/package.json');return req(root+'/dist-electron/electron/main/backup/format.js').readSnapshot(req(root+'/dist-electron/electron/main/db/connection.js').getDb());},root);
    assert.deepEqual(restored,setup.snapshot);
    console.log('Native: snapshot verified');
    assert((await page.evaluate(()=>window.maji.backup.status())).files.some(f=>f.kind==='safety'));
    await app.evaluate(({},root)=>{globalThis.qaBackupUnlock=process.getBuiltinModule('module').createRequire(root+'/package.json')(root+'/dist-electron/electron/main/backup/writeGate.js').beginRestore();},root);
    const writeError=await page.evaluate(async()=>{try{await window.maji.notes.update('note_func_args',{title:'不应写入'});return '';}catch(e){return e.message;}});
    assert(writeError.includes('正在恢复备份'));
    await app.evaluate(()=>{globalThis.qaBackupUnlock();delete globalThis.qaBackupUnlock;});
    await shutdown(); app=await launch();page=await app.firstWindow();await page.waitForFunction(()=>!!window.maji?.backup);
    assert.equal((await page.evaluate(()=>window.maji.morningNotes.list())).length,1);
    await app.evaluate(({app,dialog})=>{const req=process.getBuiltinModule('module').createRequire(app.getAppPath()+'/package.json');const file=req('node:path').join(app.getPath('userData'),'bad.json');req('node:fs').writeFileSync(file,'damaged');dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});});
    const invalid=await page.evaluate(async()=>{try{await window.maji.backup.preview();return '';}catch(e){return e.message;}});
    assert(invalid.includes('JSON'));
    assert.equal((await page.evaluate(()=>window.maji.morningNotes.list())).length,1);
    await app.evaluate(({app,dialog},root)=>{
      const req=process.getBuiltinModule('module').createRequire(root+'/package.json'),format=req(root+'/dist-electron/electron/main/backup/format.js');
      const file=req('node:path').join(app.getPath('userData'),'empty.json');
      req('node:fs').writeFileSync(file,format.encodeBackup(Object.fromEntries(format.TABLES.map(t=>[t,[]])),app.getVersion()));
      dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});
    },root);
    const empty=await page.evaluate(()=>window.maji.backup.preview());
    const emptyLoaded=page.waitForEvent('load');
    await page.evaluate(token=>window.maji.backup.restore(token),empty.token).catch(e=>{if(!/context.*destroyed/i.test(e.message))throw e;});
    await emptyLoaded;
    await shutdown();app=await launch();page=await app.firstWindow();await page.waitForFunction(()=>!!window.maji?.backup);
    assert.equal((await page.evaluate(()=>window.maji.courses.list())).length,0);
    assert.equal((await page.evaluate(()=>window.maji.notes.list())).length,0);
    console.log('PASS: Electron backup bridge, complete SQLite round-trip, safety backup, restart persistence, empty restore without demo reseeding.');
  } finally {
    await shutdown();
    // Only the exact mkdtemp-created profile under the OS temp directory is removed.
    if(path.dirname(profile)===path.resolve(os.tmpdir()) && path.basename(profile).startsWith('maji-backup-qa-'))fs.rmSync(profile,{recursive:true,force:true});
  }
})().catch(e=>{console.error(e);process.exitCode=1;});

