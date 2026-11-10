export interface ProjectFile {
  id: string;
  path: string;
  size: number;
}

export interface ProjectAttachment {
  name: string;
  files: ProjectFile[];
  incomplete: boolean;
}

export interface ProjectExcerpt {
  fileId: string;
  path: string;
  offset: number;
  nextOffset: number | null;
  text: string;
}

export interface ProjectAttachmentsApi {
  choose(kind: 'folder' | 'files'): Promise<ProjectAttachment | null>;
}

export const PROJECT_EXCERPT_BYTES = 4096;
export interface ClassroomProjectContext {
  tree: string;
  treeIncomplete: boolean;
  files: AsyncIterable<ProjectExcerpt>;
}
