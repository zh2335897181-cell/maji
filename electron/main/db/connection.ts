/* =============================================================================
   码迹 · 数据库连接
   -----------------------------------------------------------------------------
   · better-sqlite3 是原生模块，这里用 require 而不是 import：
     这样原生模块加载失败（ABI 不匹配、缺少编译产物）时能被捕获，
     由主进程弹出中文错误框并退出，而不是留下一个白窗口。
   · 连接开启 WAL 与外键，打开后立刻迁移 + 首次播种。
   ============================================================================= */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type BetterSqlite3 from 'better-sqlite3';
import { migrate } from './schema';
import { seedIfEmpty } from './seed';

export type SqliteDatabase = BetterSqlite3.Database;

/** 构造函数只需要 new (文件名) 这一种用法，不依赖 @types 内部命名 */
interface SqliteConstructor {
  new (filename: string): SqliteDatabase;
}

let connection: SqliteDatabase | null = null;
let databaseFilePath = '';

/** 载入原生驱动；失败时抛出可直接展示给用户的中文错误 */
function loadDriver(): SqliteConstructor {
  try {
    return require('better-sqlite3') as SqliteConstructor;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`原生模块 better-sqlite3 加载失败：${reason}`);
  }
}

/** 打开（或复用）数据库连接；首次调用会建表、迁移并在空库时写入示例数据 */
export function openDatabase(filePath: string): SqliteDatabase {
  if (connection) return connection;

  const directory = path.dirname(filePath);
  if (directory && !fs.existsSync(directory)) fs.mkdirSync(directory, { recursive: true });

  const Database = loadDriver();
  const db = new Database(filePath);
  try {
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');
    migrate(db);
    seedIfEmpty(db);
  } catch (error) {
    db.close();
    throw error;
  }

  connection = db;
  databaseFilePath = filePath;
  return db;
}

/** 取当前连接；未初始化时直接报错，避免调用方拿到半初始化状态 */
export function getDb(): SqliteDatabase {
  if (!connection) throw new Error('数据库尚未初始化。');
  return connection;
}

/** 数据库文件位置，用于“关于”面板展示 */
export function databaseFile(): string {
  return databaseFilePath;
}

export function closeDatabase(): void {
  if (!connection) return;
  connection.close();
  connection = null;
}
