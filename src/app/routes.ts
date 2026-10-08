/* =============================================================================
   码迹 · 路由表
   ============================================================================= */

export const ROUTES = {
  home: '/',
  notes: '/notes',
  note: (noteId: string) => `/notes/${noteId}`,
  courses: '/courses',
  coursesWith: (params: { courseId?: string; tag?: string; noteId?: string }) => {
    const search = new URLSearchParams();
    if (params.courseId) search.set('course', params.courseId);
    if (params.tag) search.set('tag', params.tag);
    if (params.noteId) search.set('note', params.noteId);
    const query = search.toString();
    return query ? `/courses?${query}` : '/courses';
  },
  search: '/search',
  searchWith: (text: string) => `/search?q=${encodeURIComponent(text)}`,
  review: '/review',
  mindMaps: '/mindmaps',
  mindMap: (id: string) => `/mindmaps/${encodeURIComponent(id)}`,
  create: '/new',
  createWith: (kind: string, extra?: Record<string, string>) => {
    const search = new URLSearchParams({ type: kind, ...extra });
    return `/new?${search.toString()}`;
  },
  designSystem: '/design/system',
  designStates: '/design/states',
} as const;
