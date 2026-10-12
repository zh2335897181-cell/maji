import { validateExam, type ExamApi, type ExamRecord } from '../../lib/exams';
const key = 'maji:exam-records:v1';
const browser: ExamApi = {
  list: async () => JSON.parse(localStorage.getItem(key) ?? '[]').map(validateExam),
  save: async (value) => {
    const exam = validateExam(value),
      records: ExamRecord[] = JSON.parse(localStorage.getItem(key) ?? '[]').map(validateExam);
    const previous = records.find((e) => e.id === exam.id);
    if ((previous?.revision ?? 0) !== exam.revision)
      throw new Error('考试记录已变化，请保留当前草稿后重新打开');
    const saved = { ...exam, revision: exam.revision + 1, updatedAt: new Date().toISOString() };
    localStorage.setItem(key, JSON.stringify([saved, ...records.filter((e) => e.id !== saved.id)]));
    return saved;
  },
  analyze: async () => {
    throw new Error('AI 分析请在桌面应用中配置模型后使用');
  },
};
export function examApi(): ExamApi {
  if (window.maji && !window.maji.exams) throw new Error('请重启新版桌面应用以加载考试模块');
  return window.maji?.exams ?? browser;
}
