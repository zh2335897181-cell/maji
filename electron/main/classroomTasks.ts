import { app } from 'electron';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, rm, lstat, realpath } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import type { ProjectFileReference } from '../../src/lib/projectAttachments';
import type { SummaryProgress, SummaryOptions } from '../../src/lib/summaryTask';

interface SavedTask extends SummaryProgress {
  sourceHash: string;
  manifest: ProjectFileReference[] | null;
}

const digest = (value: string) => createHash('sha256').update(value).digest('hex');

export class ClassroomTasks {
  private controllers = new Map<string, AbortController>();

  private directory(id: string) {
    if (!/^class_[a-zA-Z0-9_-]{1,100}$/.test(id)) throw Error('课堂任务参数无效');
    return join(process.env.MAJI_SUMMARY_RUNTIME ?? join(app.getPath('userData'), 'classroom-tasks'), id);
  }

  private async write(file: string, value: unknown) {
    const temporary = file + '.tmp';
    await writeFile(temporary, JSON.stringify(value), 'utf8');
    await rename(temporary, file);
  }

  private async load(id: string): Promise<SavedTask | null> {
    try { return JSON.parse(await readFile(join(this.directory(id), 'task.json'), 'utf8')); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
  }

  async status(id: string): Promise<SummaryProgress | null> {
    const task = await this.load(id);
    if (!task) return null;
    const { sourceHash: _hash, manifest: _manifest, ...progress } = task;
    if (progress.state === 'running' && !this.controllers.has(id)) {
      return { ...progress, state: 'paused', message: '上次任务已中断，可继续处理' };
    }
    return progress;
  }

  async resumeManifest(id: string, source: string) {
    const task = await this.load(id);
    if (!task) throw Error('没有可继续的总结任务');
    if (task.sourceHash !== digest(source)) throw Error('课堂原文已修改，请重新生成总结');
    return task.manifest;
  }

  cancel(id: string) {
    this.directory(id);
    this.controllers.get(id)?.abort(new Error('任务已取消，可稍后继续'));
  }

  async remove(id:string){
    if(this.controllers.has(id))throw Error('请先取消总结任务');
    const directory=resolve(this.directory(id));
    const expectedRoot=resolve(process.env.MAJI_SUMMARY_RUNTIME??join(app.getPath('userData'),'classroom-tasks'));
    if(dirname(directory)!==expectedRoot)throw Error('任务目录无效');
    const info=await lstat(directory).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
    if(!info)return;
    if(info.isSymbolicLink()||!info.isDirectory())throw Error('任务目录无效');
    const actual=await realpath(directory),root=await realpath(expectedRoot);
    if(dirname(actual)!==root)throw Error('任务目录超出预期位置');
    await rm(actual,{recursive:true,force:true});
  }

  async markDone(id:string){
    const task=await this.load(id);
    if(task)await this.write(join(this.directory(id),'task.json'),{...task,state:'done',stage:'总结已保存',message:undefined});
  }

  cancelAll() { for (const controller of this.controllers.values()) controller.abort(new Error('任务已中断，可稍后继续')); }

  async analysis(id: string, path: unknown): Promise<{ path: string; text: string }> {
    if (typeof path !== 'string') throw Error('文件路径无效');
    const task = await this.load(id);
    if (!task?.analyses?.includes(path)) throw Error('此文件暂无已保存的分析');
    return JSON.parse(await readFile(join(this.directory(id), 'analysis-' + digest(path) + '.json'), 'utf8'));
  }

  async begin(id: string, source: string, manifest: ProjectFileReference[] | null) {
    if (this.controllers.has(id)) throw Error('本课堂总结正在处理');
    const directory = this.directory(id);
    await mkdir(directory, { recursive: true });
    const controller = new AbortController();
    this.controllers.set(id, controller);
    let task: SavedTask = {
      sourceHash: digest(source), manifest, state: 'running', stage: '准备任务',
      completedFiles: 0, totalFiles: manifest?.length ?? 0, completedRequests: 0, analyses: [],
    };
    // Writes are serialised because polling, cancellation and AI responses can overlap.
    let writes = Promise.resolve();
    const saveTask = () => {
      const snapshot = { ...task, analyses: [...(task.analyses ?? [])] };
      writes = writes.then(() => this.write(join(directory, 'task.json'), snapshot));
      return writes;
    };
    try { await saveTask(); }
    catch (error) { this.controllers.delete(id); throw error; }
    const options: SummaryOptions = {
      signal: controller.signal,
      progress: async (stage, file, completedFiles) => {
        controller.signal.throwIfAborted();
        task = { ...task, stage, file, completedFiles: completedFiles ?? task.completedFiles };
        await saveTask();
      },
      cached: async key => {
        controller.signal.throwIfAborted();
        try {
          const value=JSON.parse(await readFile(join(directory,key+'.json'),'utf8'));
          return typeof value.text==='string'?value.text:null;
        }
        catch (error) { if (error instanceof SyntaxError || (error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
      },
      save: async (key, text) => {
        await this.write(join(directory, key + '.json'), { text });
        task.completedRequests++;
        await saveTask();
      },
      fileAnalysis: async (path, text) => {
        await this.write(join(directory, 'analysis-' + digest(path) + '.json'), { path, text });
        if (!task.analyses!.includes(path)) task.analyses!.push(path);
        await saveTask();
      },
    };
    return {
      options,
      finish: async (error?: unknown) => {
        task = {
          ...task, state: error ? controller.signal.aborted ? 'paused' : 'error' : 'done',
          stage: error ? '任务已暂停，可继续' : '总结已保存',
          message: error ? error instanceof Error ? error.message : String(error) : undefined,
        };
        try { await saveTask(); } finally { this.controllers.delete(id); }
      },
    };
  }
}
