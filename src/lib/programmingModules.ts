import { newExam, type ExamRecord } from './exams';
/** Each question is the isolation boundary; legacy exams can contain several modules. */
export function newProgrammingModule(name: string): ExamRecord {
  const record = newExam(name);
  record.kind = 'programming';
  record.questions = record.questions.map((q) => ({
    ...q,
    title: name,
    type: '项目题',
    categories: [],
  }));
  return record;
}
export function inferFileRole(path: string, content: string): string {
  const source = `${path}\n${content.slice(0, 3000)}`;
  if (
    /controller\b|controller[./\\]|Controller\.(java|cs)/i.test(source) ||
    /@(RestController|Controller)\b/.test(content)
  )
    return 'Controller';
  if (/service(impl)?[./\\]|Service(Impl)?\.(java|cs)|package\s+[\w.]+\.service\b/i.test(source))
    return 'Service';
  if (/mapper[./\\]|Mapper\.(java|xml)|<mapper\s|@Mapper\b/i.test(source)) return 'Mapper';
  if (/entity[./\\]|package\s+[\w.]+\.(entity|pojo|domain)\b/i.test(source)) return '实体';
  if (/\.(ya?ml|properties|json)$/i.test(path) || /(Application|Config)\.java$/i.test(path))
    return '配置';
  if (/\.(html|css|jsx|tsx)$/i.test(path)) return '前端';
  if (/(?:Test|Spec)\.(java|js|ts)$|(?:test|spec)[./\\]/i.test(path)) return '测试';
  return '其他';
}
