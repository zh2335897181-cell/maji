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

export const PROJECT_EXCERPT_BYTES = 64 * 1024;
export interface ProjectFileReference extends ProjectFile {
  absolutePath: string;
  modifiedAt: number;
}

export interface ClassroomProjectContext {
  tree: string;
  treeIncomplete: boolean;
  files: AsyncIterable<ProjectExcerpt>;
  manifest?: ProjectFileReference[];
  validate?(signal?:AbortSignal):Promise<void>;
}
