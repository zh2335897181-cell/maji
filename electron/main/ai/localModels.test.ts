import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {mkdtemp,mkdir,writeFile,rm,access} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {LocalModelService} from './localModels';
const mocks=vi.hoisted(()=>({spawn:vi.fn(),dialog:vi.fn(),where:vi.fn()}));
vi.mock('electron',()=>({app:{on:vi.fn(),getPath:()=>directory,getAppPath:()=>directory},dialog:{showOpenDialog:mocks.dialog}}));
vi.mock('node:child_process',()=>{const execFile=(...args:any[])=>args.at(-1)(null,mocks.where(),'');Object.defineProperty(execFile,Symbol.for('nodejs.util.promisify.custom'),{value:async()=>({stdout:mocks.where(),stderr:''})});const api={spawn:mocks.spawn,execFile};return {...api,default:api};});
let directory:string;
beforeEach(async()=>{directory=await mkdtemp(join(tmpdir(),'maji-models-test-'));await writeFile(join(directory,'ollama.exe'),'');mocks.where.mockReturnValue(join(directory,'ollama.exe'));mocks.spawn.mockReset();});
afterEach(async()=>{vi.unstubAllEnvs();await rm(directory,{recursive:true,force:true});});
it('pins GGUF import to localhost even when OLLAMA_HOST points to a remote server',async()=>{
 vi.stubEnv('OLLAMA_HOST','https://remote.example');
 const file=join(directory,'model.gguf');await writeFile(file,'GGUF');mocks.dialog.mockResolvedValue({canceled:false,filePaths:[file]});
 mocks.spawn.mockImplementation(()=>{const child=Object.assign(new EventEmitter(),{stdout:new PassThrough(),stderr:new PassThrough(),kill:vi.fn()});setTimeout(()=>child.emit('exit',0),0);return child;});
 const service=new LocalModelService(()=>true);await service.importGGUF();
 await vi.waitFor(()=>expect(service.job().state).toBe('done'));
 expect(mocks.spawn.mock.calls[0]![2].env).toMatchObject({OLLAMA_HOST:'127.0.0.1:11434',OLLAMA_NO_CLOUD:'1'});
});
it('cancelled speech imports do not spawn Python or activate the directory',async()=>{
 const runtime=join(directory,'runtime'),model=join(directory,'model');vi.stubEnv('MAJI_SPEECH_RUNTIME',runtime);
 await mkdir(join(runtime,'venv','Scripts'),{recursive:true});await writeFile(join(runtime,'venv','Scripts','python.exe'),'');await mkdir(join(directory,'speech'));await writeFile(join(directory,'speech','worker.py'),'');
 await mkdir(model);await writeFile(join(model,'model.int8.onnx'),'');await writeFile(join(model,'tokens.txt'),'');mocks.dialog.mockResolvedValue({canceled:false,filePaths:[model]});
 const service=new LocalModelService(()=>true);await service.importSpeech();await service.cancel();await vi.waitFor(()=>expect(service.job().state).toBe('error'));
 expect(mocks.spawn).not.toHaveBeenCalled();await expect(access(join(runtime,'model-config.json'))).rejects.toThrow();
});
