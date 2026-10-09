import { createId } from '../../lib/text';
import { sortMorningNotes, validateMorningInput, type MorningApi, type MorningNote } from '../../lib/morningNotes';
const STORAGE = 'maji:morning-notes:v1';
function read(): MorningNote[] {
  const value = JSON.parse(localStorage.getItem(STORAGE) ?? '[]') as MorningNote[];
  if (!Array.isArray(value)) throw new Error('本地晨考数据无效');
  return value.map(note => {
    if (typeof note.id !== 'string' || !Number.isSafeInteger(note.revision) || note.revision < 1) throw new Error('本地晨考数据无效');
    return { ...note, ...validateMorningInput(note) };
  });
}
const browser: MorningApi = {
  list: async () => sortMorningNotes(read()),
  create: async value => {
    const input = validateMorningInput(value), now = new Date().toISOString();
    const note: MorningNote = { ...input, id: createId('morning'), revision: 1, createdAt: now, updatedAt: now };
    localStorage.setItem(STORAGE, JSON.stringify([note, ...read()])); return note;
  },
  update: async (id, value, revision) => {
    const input = validateMorningInput(value), notes = read(), previous = notes.find(n => n.id === id);
    if (!previous || previous.revision !== revision) throw new Error('晨考已被修改或删除，请保留草稿后重新打开');
    const note = { ...previous, ...input, revision: revision + 1, updatedAt: new Date().toISOString() };
    localStorage.setItem(STORAGE, JSON.stringify(notes.map(n => n.id === id ? note : n))); return note;
  },
};
export function morningApi(): MorningApi {
  if (window.maji && !window.maji.morningNotes) throw new Error('请重启新版桌面应用以加载晨考模块');
  return window.maji?.morningNotes ?? browser;
}
