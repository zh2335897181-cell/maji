export interface MorningInput { date: string; title: string; contentJson: string }
export interface MorningNote extends MorningInput { id: string; revision: number; createdAt: string; updatedAt: string }
export interface MorningApi {
  list(): Promise<MorningNote[]>;
  create(input: MorningInput): Promise<MorningNote>;
  update(id: string, input: MorningInput, expectedRevision: number): Promise<MorningNote>;
}
export const EMPTY_MORNING_CONTENT = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] });
export function todayDate(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
export function sortMorningNotes(notes: MorningNote[]): MorningNote[] {
  return [...notes].sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
}
export function validateMorningInput(value: unknown): MorningInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('晨考内容无效');
  const input = value as Record<string, unknown>;
  if (typeof input.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error('请选择有效的晨考日期');
  const date = new Date(`${input.date}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== input.date) throw new Error('请选择有效的晨考日期');
  if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 200) throw new Error('晨考标题需填写，最多 200 字');
  if (typeof input.contentJson !== 'string' || input.contentJson.length > 2_000_000) throw new Error('晨考正文无效或过长');
  try {
    const doc = JSON.parse(input.contentJson);
    if (!doc || doc.type !== 'doc' || !Array.isArray(doc.content)) throw new Error();
  } catch { throw new Error('晨考正文格式无效'); }
  return { date: input.date, title: input.title.trim(), contentJson: input.contentJson };
}
