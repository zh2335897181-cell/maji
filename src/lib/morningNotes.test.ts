import { describe, expect, it } from 'vitest';
import { validateMorningInput, todayDate, sortMorningNotes } from './morningNotes';
const input = { date: '2026-10-09', title: 'IOC 概念', contentJson: '{"type":"doc","content":[{"type":"paragraph"}]}' };
describe('morning notes', () => {
  it('accepts real calendar dates and rejects invalid dates and documents', () => {
    expect(validateMorningInput(input)).toEqual(input);
    expect(validateMorningInput({ ...input, date: '2024-02-29' }).date).toBe('2024-02-29');
    for (const date of ['2026-02-29', '2026-02-30', '2026-13-01', '2026-1-9', '']) expect(() => validateMorningInput({ ...input, date })).toThrow('日期');
    expect(() => validateMorningInput({ ...input, title: ' ' })).toThrow('标题');
    expect(() => validateMorningInput({ ...input, contentJson: '{invalid' })).toThrow('正文');
    expect(() => validateMorningInput({ ...input, contentJson: '{"type":"other"}' })).toThrow('正文');
  });
  it('uses local date and sorts by record date before update time', () => {
    expect(todayDate(new Date(2026, 9, 9, 0, 5))).toBe('2026-10-09');
    const rows = [{ ...input, id: 'old', revision: 1, createdAt: '', updatedAt: 'z' }, { ...input, id: 'new', date: '2026-10-10', revision: 1, createdAt: '', updatedAt: 'a' }];
    expect(sortMorningNotes(rows).map(n => n.id)).toEqual(['new', 'old']);
    expect(rows[0].id).toBe('old');
  });
});
