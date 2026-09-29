import { describe, expect, it } from 'vitest';
import { migrate, SCHEMA_VERSION } from './schema';
import type { SqliteDatabase } from './connection';

describe('database schema migration', () => {
  it('adds AI review session tables to a v3 database without rebuilding existing data', () => {
    const statements: string[] = [];
    const db = {
      pragma: (statement: string, options?: { simple?: boolean }) => {
        if (statement === 'user_version' && options?.simple) return 3;
        statements.push(`PRAGMA ${statement}`);
        return undefined;
      },
      exec: (statement: string) => statements.push(statement),
      transaction: (callback: () => void) => callback,
    } as unknown as SqliteDatabase;

    migrate(db);

    expect(statements.some((statement) => statement.includes('CREATE TABLE review_sessions'))).toBe(true);
    expect(statements.some((statement) => statement.includes('CREATE TABLE review_questions'))).toBe(true);
    expect(statements).toContain(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  });

  it('adds a course track column and preserves each existing course language', () => {
    const statements: string[] = [];
    const db = {
      pragma: (statement: string, options?: { simple?: boolean }) => {
        if (statement === 'user_version' && options?.simple) return 2;
        statements.push(`PRAGMA ${statement}`);
        return undefined;
      },
      exec: (statement: string) => statements.push(statement),
      transaction: (callback: () => void) => callback,
    } as unknown as SqliteDatabase;

    migrate(db);

    expect(statements).toContain("ALTER TABLE courses ADD COLUMN track TEXT NOT NULL DEFAULT 'python'");
    expect(statements).toContain('UPDATE courses SET track = language');
    expect(statements).toContain(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  });
});
