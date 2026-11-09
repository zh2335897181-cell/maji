import { afterEach, expect, it, vi } from 'vitest';
import { doc, heading, paragraph } from '../../lib/noteDoc';
import { exportNoteAsMarkdown } from './exportNote';

afterEach(() => vi.unstubAllGlobals());

it('exports an edited note with a single opening title and requests the desktop', async () => {
  const exportMarkdown = vi.fn().mockResolvedValue({ saved: true, path: 'lesson.md' });
  vi.stubGlobal('maji', { files: { exportMarkdown } });
  const body = JSON.stringify(doc(heading(1, 'Java 课堂'), heading(2, '事务'), paragraph('已订正')));

  const result = await exportNoteAsMarkdown('Java 课堂', body, 'xmind');

  expect(result.saved).toBe(true);
  expect(exportMarkdown).toHaveBeenCalledWith('Java 课堂.md', '# Java 课堂\n\n## 事务\n\n已订正\n', 'desktop');
});

it('adds the note title when the body starts below the central topic', async () => {
  const exportMarkdown = vi.fn().mockResolvedValue({ saved: false });
  vi.stubGlobal('maji', { files: { exportMarkdown } });
  const body = JSON.stringify(doc(heading(2, '事务')));

  const result = await exportNoteAsMarkdown('Java 课堂', body, 'xmind');

  expect(result.saved).toBe(false);
  expect(exportMarkdown).toHaveBeenCalledWith('Java 课堂.md', '# Java 课堂\n\n## 事务\n', 'desktop');
});
