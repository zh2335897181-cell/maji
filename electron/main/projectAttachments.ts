import { randomUUID } from 'node:crypto';
import { lstat, open, opendir, realpath } from 'node:fs/promises';
import * as path from 'node:path';
import { TextDecoder } from 'node:util';
import { BrowserWindow, dialog, type IpcMainInvokeEvent } from 'electron';
import {
  PROJECT_EXCERPT_BYTES, type ClassroomProjectContext,
  type ProjectAttachment, type ProjectExcerpt, type ProjectFileReference,
} from '../../src/lib/projectAttachments';

const SKIP_DIRS = new Set(['.git', 'node_modules', '.venv', 'dist', 'build', 'target', 'coverage']);
const INDEX_LIMIT = 2000;
const ENTRY_LIMIT = 10000;
const TREE_CONTEXT_LIMIT = 8000;
const SECRET_NAME = /^(?:\.env(?:\..*)?|\.npmrc|\.pypirc|id_(?:rsa|ed25519|ecdsa|dsa)(?:\..*)?)$|\.(?:pem|key|pfx|p12|jks|keystore)$/i;

type AttachedFile = Omit<ProjectFileReference, 'modifiedAt'> & { modifiedAt?: number };

interface Attachment {
  summary: ProjectAttachment;
  files: Map<string, AttachedFile>;
}

async function collect(files: string[], folder?: string): Promise<Attachment> {
  const attached = new Map<string, AttachedFile>();
  const roots = folder ? [folder] : files;
  let visited = 0;
  let incomplete = false;
  async function walk(absolutePath: string): Promise<void> {
    if (++visited > ENTRY_LIMIT || attached.size >= INDEX_LIMIT) {
      incomplete = true;
      return;
    }
    const name = path.basename(absolutePath);
    if (absolutePath !== folder && (SECRET_NAME.test(name) || SKIP_DIRS.has(name.toLowerCase()))) return;
    const stats = await lstat(absolutePath);
    if (stats.isDirectory() && folder) {
      for await (const entry of await opendir(absolutePath)) {
        await walk(path.join(absolutePath, entry.name));
        if (incomplete) break;
      }
    } else if (stats.isFile()) {
      const id = randomUUID();
      const relativePath = folder ? path.relative(folder, absolutePath).split(path.sep).join('/') : name;
      attached.set(id, { id, path: relativePath, size: stats.size, absolutePath, modifiedAt: stats.mtimeMs });
    }
  }
  for (const root of roots) {
    await walk(root);
    if (incomplete) break;
  }
  const counts=new Map<string,number>();
  for(const file of attached.values())counts.set(file.path,(counts.get(file.path)??0)+1);
  for(const file of attached.values())if((counts.get(file.path)??0)>1){
    file.path=path.basename(path.dirname(file.absolutePath))+'-'+file.id.slice(0,8)+'/'+file.path;
  }
  const summary = {
    name: folder ? path.basename(folder) || folder : '所选文件',
    files: [...attached.values()].map(({ id, path, size }) => ({ id, path, size }))
      .sort((a, b) => a.path.localeCompare(b.path)),
    incomplete,
  };
  return { summary, files: attached };
}

export async function readProjectExcerpt(file: AttachedFile, offset: number): Promise<ProjectExcerpt> {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > file.size) throw new Error('代码片段位置无效');
  const canonicalPath = await realpath(file.absolutePath);
  if (path.relative(canonicalPath, file.absolutePath) !== '') throw new Error('文件位置已变化，请重新选择项目');
  const handle = await open(canonicalPath, 'r');
  try {
    const stats = await handle.stat();
    if (!stats.isFile() || offset > stats.size || stats.size !== file.size || (file.modifiedAt !== undefined && stats.mtimeMs !== file.modifiedAt)) throw new Error('文件已变化，请重新选择项目');
    const buffer = Buffer.alloc(PROJECT_EXCERPT_BYTES + 4);
    let bytesRead = 0;
    while (bytesRead < buffer.length) {
      const chunk = await handle.read(buffer, bytesRead, buffer.length - bytesRead, offset + bytesRead);
      if (!chunk.bytesRead) break;
      bytesRead += chunk.bytesRead;
    }
    let start = 0;
    while (start < Math.min(3, bytesRead) && (buffer[start]! & 0xc0) === 0x80) start++;
    let end = Math.min(bytesRead, start + PROJECT_EXCERPT_BYTES);
    while (end > start && end < bytesRead && (buffer[end]! & 0xc0) === 0x80) end--;
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(start, end));
    } catch {
      throw new Error('仅支持 UTF-8 文本代码文件');
    }
    if (start === end && bytesRead > 0) throw new Error('文件包含无效的 UTF-8 数据');
    if (text.includes('\u0000')) throw new Error('无法预览二进制文件');
    return { fileId: file.id, path: file.path, offset: offset + start, nextOffset: offset + end < stats.size ? offset + end : null, text };
  } finally {
    await handle.close();
  }
}

export function createClassroomAttachments() {
  const sessions = new Map<number, Attachment>();
  const selecting = new Set<number>();
  async function handle(args: unknown[], event: IpcMainInvokeEvent) {
    if (event.senderFrame !== event.sender.mainFrame) throw new Error('无效的项目附件窗口');
    const key = event.sender.id;
    const [operation, value] = args;
    if (operation === 'choose') {
      if (value !== 'folder' && value !== 'files') throw new Error('请选择文件或目录');
      if (selecting.has(key)) throw new Error('文件选择窗口已经打开');
      selecting.add(key);
      try {
        const owner = BrowserWindow.fromWebContents(event.sender);
        if (!owner) throw new Error('课堂窗口已关闭');
        const result = await dialog.showOpenDialog(owner, {
          title: '添加项目附件',
          properties: value === 'folder' ? ['openDirectory'] : ['openFile', 'multiSelections'],
        });
        if (result.canceled || !result.filePaths.length) return null;
        const roots = await Promise.all(result.filePaths.map(file => realpath(file)));
        const attachment = await collect(roots, value === 'folder' ? roots[0] : undefined);
        if (event.sender.isDestroyed()) return null;
        if (!sessions.has(key)) event.sender.once('destroyed', () => sessions.delete(key));
        sessions.set(key, attachment);
        return attachment.summary;
      } finally {
        selecting.delete(key);
      }
    }
    throw new Error('附件操作无效');
  }

  function context(senderId: number, value: unknown): ClassroomProjectContext | undefined {
    if (value === undefined) return undefined;
    if (!Array.isArray(value) || !value.length || value.length > INDEX_LIMIT) {
      throw new Error('请选择要发送的代码文件');
    }
    const attachment = sessions.get(senderId);
    if (!attachment) throw new Error('请重新选择课堂项目附件');
    const selected = [...new Set(value)].map(id => {
      const file = typeof id === 'string' ? attachment.files.get(id) : undefined;
      if (!file) throw new Error('文件不在当前项目中');
      return file;
    });
    return projectContext(selected as ProjectFileReference[], attachment.summary.incomplete);
  }

  return { handle, context };
}

export function projectContext(selected: ProjectFileReference[], incomplete = false): ClassroomProjectContext {
    async function* files() {
      for (const file of selected) {
        let offset: number | null = 0;
        while (offset !== null) {
          let page:ProjectExcerpt;
          try{page=await readProjectExcerpt(file,offset);}
          catch(error){throw Error(file.path+'：'+(error instanceof Error?error.message:String(error)));}

          yield page;
          offset = page.nextOffset;
        }
      }
    }
    const tree = selected.map(file => file.path).join('\n');
    return { tree: tree.slice(0, TREE_CONTEXT_LIMIT), files: files(), manifest: selected,
      validate:async signal=>{
        for await(const _page of files())signal?.throwIfAborted();
      },
      treeIncomplete: incomplete || tree.length > TREE_CONTEXT_LIMIT };
}
