// Preserve a transactionally consistent, pre-migration copy of the installed desktop DB.
const Database=require('better-sqlite3'),fs=require('node:fs'),path=require('node:path');
const directory=path.join(process.env.APPDATA,'码迹'),source=path.join(directory,'maji.db');
(async()=>{if(!fs.existsSync(source)){console.log('No existing database');return;}
const destination=path.join(directory,'safety-before-classroom');fs.mkdirSync(destination,{recursive:true});
const file=path.join(destination,`maji-${Date.now()}.db`);const db=new Database(source,{readonly:true,fileMustExist:true});
try{await db.backup(file);console.log(file);}finally{db.close();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
