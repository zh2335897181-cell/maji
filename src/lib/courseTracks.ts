import type { CourseTrackId, LanguageId } from './types';

/** 课程方向是学习主题，`LanguageId` 仍只表示笔记和代码块的实际语法语言。 */
export const COURSE_TRACKS: { value: CourseTrackId; label: string }[] = [
  { value: 'python', label: 'Python' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'html', label: 'HTML / CSS 基础' },
  { value: 'java', label: 'Java' },
  { value: 'c', label: 'C' },
  { value: 'vue', label: 'Vue（前端框架）' },
  { value: 'react', label: 'React（前端框架）' },
  { value: 'nodejs', label: 'Node.js（后端）' },
  { value: 'springboot', label: 'Spring Boot（后端框架）' },
  { value: 'django', label: 'Django（Python 后端）' },
  { value: 'flask', label: 'Flask（Python 后端）' },
  { value: 'algorithms', label: '数据结构与算法' },
  { value: 'database', label: '数据库 / SQL' },
  { value: 'text', label: '纯文本' },
  { value: 'other', label: '其他技术' },
];

const DEFAULT_LANGUAGE: Record<CourseTrackId, LanguageId> = {
  python: 'python',
  javascript: 'javascript',
  typescript: 'typescript',
  html: 'html',
  css: 'css',
  java: 'java',
  c: 'c',
  text: 'text',
  vue: 'typescript',
  react: 'typescript',
  nodejs: 'javascript',
  springboot: 'java',
  django: 'python',
  flask: 'python',
  algorithms: 'text',
  database: 'text',
  other: 'text',
};

export function defaultLanguageForTrack(track: CourseTrackId): LanguageId {
  return DEFAULT_LANGUAGE[track];
}

export function trackFromLanguage(language: LanguageId): CourseTrackId {
  return language;
}

export function isCourseTrackId(value: unknown): value is CourseTrackId {
  return typeof value === 'string' && Object.hasOwn(DEFAULT_LANGUAGE, value);
}
