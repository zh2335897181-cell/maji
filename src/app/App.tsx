import { useEffect, type ReactElement } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { useLibrary } from './LibraryProvider';
import { AppLayout } from './AppLayout';
import { CoursesPage } from '../features/courses/CoursesPage';
import { CreatePage } from '../features/create/CreatePage';
import { DesignStatesPage } from '../features/design/DesignStatesPage';
import { DesignSystemPage } from '../features/design/DesignSystemPage';
import { HomePage } from '../features/home/HomePage';
import { NoteEditorPage } from '../features/notes/NoteEditorPage';
import { ReviewPage } from '../features/review/ReviewPage';
import { MindMapPage } from '../features/mindmap/MindMapPage';
import { SearchPage } from '../features/search/SearchPage';
import { NotFoundPage } from '../features/home/NotFoundPage';
import { ROUTES } from './routes';

/** 打开 /notes 时回到最近一次打开的笔记 */
function NotesRedirect(): ReactElement {
  const { notes, settings } = useLibrary();
  const target =
    (settings.lastOpenedNoteId && notes.some((note) => note.id === settings.lastOpenedNoteId)
      ? settings.lastOpenedNoteId
      : notes[0]?.id) ?? null;
  return target ? <Navigate to={ROUTES.note(target)} replace /> : <Navigate to={ROUTES.home} replace />;
}

/** 切换笔记时把滚动位置复位到顶部 */
function ScrollReset(): null {
  const params = useParams();
  useEffect(() => {
    document.querySelectorAll('[data-scroll-container]').forEach((node) => {
      node.scrollTop = 0;
    });
  }, [params]);
  return null;
}

export function App(): ReactElement {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path={ROUTES.home} element={<HomePage />} />
        <Route path={ROUTES.notes} element={<NotesRedirect />} />
        <Route
          path="/notes/:noteId"
          element={
            <>
              <ScrollReset />
              <NoteEditorPage />
            </>
          }
        />
        <Route path={ROUTES.courses} element={<CoursesPage />} />
        <Route path={ROUTES.search} element={<SearchPage />} />
        <Route path={ROUTES.review} element={<ReviewPage />} />
        <Route path={ROUTES.mindMaps} element={<MindMapPage />} />
        <Route path="/mindmaps/:mapId" element={<MindMapPage />} />
        <Route path={ROUTES.create} element={<CreatePage />} />
        <Route path={ROUTES.designSystem} element={<DesignSystemPage />} />
        <Route path={ROUTES.designStates} element={<DesignStatesPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
