import { describe, expect, it } from 'vitest';
import { validateCourseCreate, validateCourseUpdate } from './validate';

describe('course direction IPC validation', () => {
  it('accepts framework tracks while keeping the code language separate', () => {
    expect(validateCourseCreate({ name: 'Spring Boot 入门', track: 'springboot', language: 'java' }))
      .toMatchObject({ name: 'Spring Boot 入门', track: 'springboot', language: 'java' });
    expect(validateCourseUpdate({ track: 'vue', language: 'typescript' }))
      .toEqual({ track: 'vue', language: 'typescript' });
  });

  it('rejects an unsupported course direction', () => {
    expect(() => validateCourseCreate({ name: 'Bad track', track: 'not-a-track' })).toThrow('课程技术方向无效');
    expect(() => validateCourseUpdate({ track: 'not-a-track' })).toThrow('课程技术方向无效');
  });
});
