/* =============================================================================
   码迹 · IPC 通道注册
   -----------------------------------------------------------------------------
   · 只有下面这张表里的通道会被注册，渲染进程无法调用别的东西
   · 参数一律先过 validate.ts，再交给 db 层
   · 统一 try/catch：任何异常都折成可读的中文 Error 抛回渲染进程
   · 导出 Markdown 只允许渲染进程给“文件名建议”，落盘路径由用户在系统对话框里选
   ============================================================================= */

import { BrowserWindow, app, dialog, ipcMain, shell, type IpcMainInvokeEvent } from 'electron';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { IPC, type AppInfo, type ExportResult } from '../../../src/lib/ipc';
import { toSafeFileName } from '../../../src/lib/text';
import * as courses from '../db/courses';
import * as library from '../db/library';
import * as notes from '../db/notes';
import { databaseFile } from '../db/connection';
import type { UpdateService } from '../updates';
import type { AIService } from '../ai/service';
import { createAIHandlers } from '../ai/ipc';
import { createMindMapHandlers } from './mindMaps';
import {
  requireEntityId,
  requireNoteId,
  requireReviewAction,
  validateCourseCreate,
  validateCourseUpdate,
  validateExerciseCreate,
  validateExerciseFilter,
  validateExerciseToggle,
  validateExportArgs,
  validateExternalUrl,
  validateNoteCreate,
  validateNoteListFilter,
  validateNotePatch,
  validateOrderedIds,
  validateReviewFilter,
  validateReviewQuestionAnswerInput,
  validateReviewQuestionGradeInput,
  validateReviewSessionFilter,
  validateReviewSessionInput,
  validateReviewSessionPatch,
  validateSearchQuery,
  validateSettingsPatch,
  validateSnippetCreate,
  validateSnippetLimit,
} from './validate';

type Handler = (args: unknown[], event: IpcMainInvokeEvent) => unknown | Promise<unknown>;

function appInfo(): AppInfo {
  return {
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform,
    databasePath: databaseFile(),
    electronVersion: process.versions.electron ?? '',
  };
}

/** 导出笔记：建议文件名经过净化，实际路径必须由用户在系统对话框里确认 */
async function exportMarkdown(args: unknown[], event: IpcMainInvokeEvent): Promise<ExportResult> {
  const { suggestedName, content } = validateExportArgs(args);
  const base = suggestedName.replace(/\.(md|markdown)$/i, '');
  const options = {
    title: '导出为 Markdown',
    defaultPath: toSafeFileName(base, 'md'),
    filters: [{ name: 'Markdown', extensions: ['md'] }],
  };

  const owner = BrowserWindow.fromWebContents(event.sender);
  const result = owner
    ? await dialog.showSaveDialog(owner, options)
    : await dialog.showSaveDialog(options);
  if (result.canceled || !result.filePath) return { saved: false };

  const target = path.resolve(result.filePath);
  await fs.writeFile(target, content, 'utf8');
  return { saved: true, path: target };
}

const handlers: Record<string, Handler> = {
  [IPC.appInfo]: () => appInfo(),

  [IPC.coursesList]: () => courses.listCourses(),
  [IPC.coursesCreate]: (args) => courses.createCourse(validateCourseCreate(args[0])),
  [IPC.coursesUpdate]: (args) =>
    courses.updateCourse(requireEntityId(args[0], '课程 ID'), validateCourseUpdate(args[1])),
  [IPC.coursesDelete]: (args) => courses.deleteCourse(requireEntityId(args[0], '课程 ID')),
  [IPC.coursesReorder]: (args) => courses.reorderCourses(validateOrderedIds(args[0])),

  [IPC.notesList]: (args) => notes.listNotes(validateNoteListFilter(args[0])),
  [IPC.notesGet]: (args) => notes.getNote(requireNoteId(args[0])),
  [IPC.notesCreate]: (args) => notes.createNote(validateNoteCreate(args[0])),
  [IPC.notesUpdate]: (args) =>
    notes.updateNote(requireNoteId(args[0]), validateNotePatch(args[1])),
  [IPC.notesDelete]: (args) => notes.deleteNote(requireNoteId(args[0])),
  [IPC.notesTouch]: (args) => notes.touchNote(requireNoteId(args[0])),
  [IPC.notesSearch]: (args) => notes.searchNotes(validateSearchQuery(args[0])),

  [IPC.tagsList]: () => library.listTags(),

  [IPC.snippetsList]: (args) => library.listSnippets(validateSnippetLimit(args[0])),
  [IPC.snippetsCreate]: (args) => library.createSnippet(validateSnippetCreate(args[0])),

  [IPC.exercisesList]: (args) => library.listExercises(validateExerciseFilter(args[0])),
  [IPC.exercisesCreate]: (args) => library.createExercise(validateExerciseCreate(args[0])),
  [IPC.exercisesToggle]: (args) =>
    library.toggleExercise(
      requireEntityId(args[0], '练习 ID'),
      validateExerciseToggle(args[1]),
    ),

  [IPC.reviewList]: (args) => library.listReviewItems(validateReviewFilter(args[0])),
  [IPC.reviewApply]: (args) =>
    library.applyReviewAction(requireEntityId(args[0], '复习 ID'), requireReviewAction(args[1])),
  [IPC.reviewSessionsList]: (args) => library.listReviewSessions(validateReviewSessionFilter(args[0])),
  [IPC.reviewSessionsGet]: (args) => library.getReviewSession(requireEntityId(args[0], '复习会话 ID')),
  [IPC.reviewSessionsCreate]: (args) => library.createReviewSession(validateReviewSessionInput(args[0])),
  [IPC.reviewSessionsUpdate]: (args) =>
    library.updateReviewSession(requireEntityId(args[0], '复习会话 ID'), validateReviewSessionPatch(args[1])),
  [IPC.reviewSessionsSaveAnswer]: (args) =>
    library.saveReviewQuestionAnswer(requireEntityId(args[0], '复习会话 ID'), validateReviewQuestionAnswerInput(args[1])),
  [IPC.reviewSessionsSaveGrade]: (args) =>
    library.saveReviewQuestionGrade(requireEntityId(args[0], '复习会话 ID'), validateReviewQuestionGradeInput(args[1])),

  [IPC.settingsGet]: () => library.getSettings(),
  [IPC.settingsUpdate]: (args) => library.updateSettings(validateSettingsPatch(args[0])),

  [IPC.exportMarkdown]: (args, event) => exportMarkdown(args, event),
  [IPC.openExternal]: async (args) => {
    await shell.openExternal(validateExternalUrl(args[0]));
  },
};

/** 注册全部白名单通道；重复调用会被 ipcMain.handle 拒绝，所以只调用一次 */
export function registerIpcHandlers(updates: UpdateService, ai: AIService): void {
  const activeHandlers: Record<string, Handler> = {
    ...handlers,
    ...createAIHandlers(ai),
    ...createMindMapHandlers(ai),
    [IPC.updatesCheck]: () => updates.checkForUpdates(),
    [IPC.updatesInstall]: () => updates.installDownloadedUpdate(),
    [IPC.updatesStatusGet]: () => updates.getStatus(),
  };
  for (const [channel, handler] of Object.entries(activeHandlers)) {
    ipcMain.handle(channel, async (event, ...args: unknown[]) => {
      try {
        return await handler(args, event);
      } catch (error) {
        // 统一包装：渲染进程只会看到可读原因，不会拿到内部堆栈
        throw new Error(error instanceof Error ? error.message : String(error));
      }
    });
  }
}
