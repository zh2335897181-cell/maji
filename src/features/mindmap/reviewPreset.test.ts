import { expect, it } from 'vitest';
import { graph } from '../../test/mindmapFixture';
import { DEFAULT_MAP_OPTIONS } from '../../lib/mindmap';
import { mindMapReviewPreset } from './reviewPreset';
it('generates review material only from the selected branch and survives deleted sources', () => {
  const map = { ...graph, id: 'map_one', revision: 1, sources: [], options: DEFAULT_MAP_OPTIONS, createdAt: '', updatedAt: '' };
  const preset = mindMapReviewPreset(map, 'b', []);
  expect(preset.sources[0]?.contentExcerpt).toContain('print(1)');
  expect(preset.sources[0]?.contentExcerpt).not.toContain('位置参数');
  expect(preset.sources[0]?.noteId).toBeNull();
});
