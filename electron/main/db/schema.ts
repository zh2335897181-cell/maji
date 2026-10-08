/* =============================================================================
   码迹 · SQLite 建表与迁移
   -----------------------------------------------------------------------------
   版本号写在 PRAGMA user_version 里：0 = 空库，1 = 初始结构，2 = 连续掌握计数，3 = 课程技术方向，4 = AI 复习会话。
   以后改结构时只允许“追加”一个迁移分支，不要修改已经发布出去的 SQL。
   ============================================================================= */

import type { SqliteDatabase } from './connection';

/** 当前应用期望的数据库结构版本 */
export const SCHEMA_VERSION = 5;

/* 说明：
   · 时间统一存 ISO 字符串（TEXT），布尔值存 INTEGER 0/1
   · notes.tags 存 JSON 数组字符串，查询时用 json_each 精确匹配
   · notes.code_text 是 contentJson 里代码块纯文本的派生列，只用于搜索粗筛
   · review_items.course_id 刻意不加外键：课程删除时保留原值，
     LEFT JOIN 取不到课程名就显示“未分类”，与浏览器示例数据仓库一致 */
const INITIAL_SCHEMA = `
CREATE TABLE courses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL,
  track TEXT NOT NULL DEFAULT 'python',
  color_key TEXT NOT NULL,
  icon_key TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  content_json TEXT NOT NULL,
  content_text TEXT NOT NULL DEFAULT '',
  code_text TEXT NOT NULL DEFAULT '',
  excerpt TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  favorite INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_opened_at TEXT
);

CREATE TABLE snippets (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  language TEXT NOT NULL,
  code TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  output TEXT,
  course_id TEXT REFERENCES courses(id) ON DELETE SET NULL,
  note_id TEXT REFERENCES notes(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE exercises (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  prompt TEXT NOT NULL,
  hint TEXT,
  solution TEXT,
  language TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  course_id TEXT REFERENCES courses(id) ON DELETE SET NULL,
  note_id TEXT REFERENCES notes(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE review_items (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL,
  state TEXT NOT NULL,
  due_at TEXT,
  last_reviewed_at TEXT,
  review_count INTEGER NOT NULL DEFAULT 0,
  mastered_streak INTEGER NOT NULL DEFAULT 0,
  confidence TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE review_sessions (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  status TEXT NOT NULL,
  depth TEXT NOT NULL,
  planned_question_count INTEGER NOT NULL,
  sources TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  active_segments TEXT NOT NULL DEFAULT '[]',
  active_segment_started_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE review_questions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES review_sessions(id) ON DELETE CASCADE,
  question_order INTEGER NOT NULL,
  type TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  title TEXT NOT NULL,
  prompt TEXT NOT NULL,
  hint TEXT NOT NULL DEFAULT '',
  reference_answer TEXT NOT NULL,
  explanation TEXT NOT NULL,
  language TEXT NOT NULL,
  source_note_id TEXT,
  answer TEXT,
  grade TEXT,
  answered_at TEXT,
  graded_at TEXT,
  UNIQUE(session_id, question_order)
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX idx_notes_course ON notes(course_id, updated_at DESC);
CREATE INDEX idx_notes_updated ON notes(updated_at DESC);
CREATE INDEX idx_notes_archived ON notes(archived, updated_at DESC);
CREATE INDEX idx_review_note ON review_items(note_id);
CREATE INDEX idx_review_state ON review_items(state);
CREATE INDEX idx_review_sessions_start ON review_sessions(started_at DESC);
CREATE INDEX idx_review_sessions_status ON review_sessions(status);
CREATE INDEX idx_review_questions_session ON review_questions(session_id, question_order);
CREATE INDEX idx_snippets_updated ON snippets(updated_at DESC);
CREATE INDEX idx_exercises_course ON exercises(course_id);
CREATE INDEX idx_exercises_note ON exercises(note_id);
`;

/**
 * 把数据库升到 SCHEMA_VERSION；空库会直接建出完整结构。
 * 结构比应用还新时直接报错，避免旧版本写坏新数据。
 */
export function migrate(db: SqliteDatabase): void {
  const current = Number(db.pragma('user_version', { simple: true }) ?? 0);
  if (current === SCHEMA_VERSION) return;
  if (current > SCHEMA_VERSION) {
    throw new Error(
      `数据库结构版本（v${current}）高于当前应用支持的版本（v${SCHEMA_VERSION}），请更新“码迹”后再打开。`,
    );
  }

  const upgrade = db.transaction(() => {
    if (current < 1) {
      db.exec(INITIAL_SCHEMA);
    } else {
      if (current < 2) {
        db.exec('ALTER TABLE review_items ADD COLUMN mastered_streak INTEGER NOT NULL DEFAULT 0');
        db.exec("UPDATE review_items SET mastered_streak = 4 WHERE state = 'mastered'");
      }
      if (current < 3) {
        db.exec("ALTER TABLE courses ADD COLUMN track TEXT NOT NULL DEFAULT 'python'");
        db.exec('UPDATE courses SET track = language');
      }
      if (current < 4) {
        db.exec(REVIEW_SESSION_SCHEMA);
      }
    }
    if (current < 5) db.exec(`
      CREATE TABLE mind_maps (id TEXT PRIMARY KEY, title TEXT NOT NULL, document TEXT NOT NULL, revision INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE mind_map_views (map_id TEXT PRIMARY KEY REFERENCES mind_maps(id) ON DELETE CASCADE, state TEXT NOT NULL);
      CREATE INDEX idx_mind_maps_updated ON mind_maps(updated_at DESC);
    `);
    db.pragma(`user_version = ${SCHEMA_VERSION}`);
  });
  upgrade();
}

const REVIEW_SESSION_SCHEMA = `
CREATE TABLE review_sessions (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  status TEXT NOT NULL,
  depth TEXT NOT NULL,
  planned_question_count INTEGER NOT NULL,
  sources TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  active_segments TEXT NOT NULL DEFAULT '[]',
  active_segment_started_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE review_questions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES review_sessions(id) ON DELETE CASCADE,
  question_order INTEGER NOT NULL,
  type TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  title TEXT NOT NULL,
  prompt TEXT NOT NULL,
  hint TEXT NOT NULL DEFAULT '',
  reference_answer TEXT NOT NULL,
  explanation TEXT NOT NULL,
  language TEXT NOT NULL,
  source_note_id TEXT,
  answer TEXT,
  grade TEXT,
  answered_at TEXT,
  graded_at TEXT,
  UNIQUE(session_id, question_order)
);
CREATE INDEX idx_review_sessions_start ON review_sessions(started_at DESC);
CREATE INDEX idx_review_sessions_status ON review_sessions(status);
CREATE INDEX idx_review_questions_session ON review_questions(session_id, question_order);
`;
