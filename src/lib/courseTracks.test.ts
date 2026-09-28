import { describe, expect, it } from 'vitest';
import { COURSE_TRACKS, defaultLanguageForTrack, trackFromLanguage } from './courseTracks';

describe('course technology tracks', () => {
  it('offers language, framework, and study-area choices', () => {
    expect(COURSE_TRACKS.map(({ value }) => value)).toContain('vue');
    expect(COURSE_TRACKS.map(({ value }) => value)).toContain('springboot');
    expect(COURSE_TRACKS.map(({ value }) => value)).toContain('algorithms');
  });

  it.each([
    ['vue', 'typescript'],
    ['react', 'typescript'],
    ['nodejs', 'javascript'],
    ['springboot', 'java'],
    ['django', 'python'],
    ['algorithms', 'text'],
  ] as const)('maps %s to a sensible default code language', (track, language) => {
    expect(defaultLanguageForTrack(track)).toBe(language);
  });

  it('keeps existing courses on their current language track', () => {
    expect(trackFromLanguage('python')).toBe('python');
    expect(trackFromLanguage('html')).toBe('html');
  });
});
