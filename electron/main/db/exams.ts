import { getDb } from './connection';
import { validateExam, type ExamRecord } from '../../../src/lib/exams';
export function listExams(): ExamRecord[] {
  return (
    getDb().prepare('SELECT document FROM exam_records ORDER BY updated_at DESC').all() as {
      document: string;
    }[]
  ).map((row) => validateExam(JSON.parse(row.document)));
}
export function saveExam(value: unknown): ExamRecord {
  const exam = validateExam(value),
    db = getDb();
  return db.transaction(() => {
    const previous = db.prepare('SELECT revision FROM exam_records WHERE id=?').get(exam.id) as
      { revision: number } | undefined;
    if ((previous?.revision ?? 0) !== exam.revision)
      throw new Error('考试记录已变化，请保留当前内容并重新打开');
    const saved = { ...exam, revision: exam.revision + 1, updatedAt: new Date().toISOString() };
    db.prepare(
      'INSERT INTO exam_records (id,document,revision,updated_at) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET document=excluded.document,revision=excluded.revision,updated_at=excluded.updated_at',
    ).run(saved.id, JSON.stringify(saved), saved.revision, saved.updatedAt);
    return saved;
  })();
}
