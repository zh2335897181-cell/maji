/* =============================================================================
   码迹 · 导出笔记
   -----------------------------------------------------------------------------
   Electron 里通过 IPC 弹出系统保存对话框；浏览器里退化为下载文件。
   两条路径都不允许渲染进程指定任意路径。
   ============================================================================= */

import { docToMarkdown, type Doc } from '../../lib/noteDoc';
import { toSafeFileName } from '../../lib/text';

export interface ExportOutcome {
  saved: boolean;
  message: string;
}

export async function exportNoteAsMarkdown(title: string, contentJson: string): Promise<ExportOutcome> {
  let markdown: string;
  try {
    markdown = docToMarkdown(JSON.parse(contentJson) as Doc);
  } catch {
    return { saved: false, message: '笔记内容无法解析，导出已取消' };
  }

  const fileName = toSafeFileName(title, 'md');

  if (window.maji) {
    try {
      const result = await window.maji.files.exportMarkdown(fileName, markdown);
      return result.saved
        ? { saved: true, message: `已导出到 ${result.path ?? fileName}` }
        : { saved: false, message: '已取消导出' };
    } catch (cause) {
      return { saved: false, message: cause instanceof Error ? cause.message : '导出失败' };
    }
  }

  // 浏览器开发模式：直接下载
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
  return { saved: true, message: `已导出 ${fileName}` };
}

export function noteMarkdown(title: string, contentJson: string): string {
  try {
    const body = docToMarkdown(JSON.parse(contentJson) as Doc);
    return `# ${title}\n\n${body}`;
  } catch {
    return `# ${title}\n`;
  }
}
