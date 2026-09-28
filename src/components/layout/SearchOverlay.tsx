import clsx from 'clsx';
import { CornerDownLeft, FileText, Search, Star, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLibrary } from '../../app/LibraryProvider';
import { ROUTES } from '../../app/routes';
import { formatRelativeTime } from '../../lib/format';
import { HIT_FIELD_LABEL } from '../../lib/search';
import { LANGUAGE_OPTIONS } from '../../lib/languages';
import type { SearchResult } from '../../lib/types';
import { Button, IconButton } from '../ui/Button';
import { HighlightedText, Tag } from '../ui/Tag';
import styles from './SearchOverlay.module.css';

export interface SearchOverlayProps {
  open: boolean;
  onClose(): void;
  initialQuery?: string;
}

/** 搜索浮层：输入即搜，↑↓ 选择，Enter 打开笔记 */
export function SearchOverlay({ open, onClose, initialQuery = '' }: SearchOverlayProps): ReactElement | null {
  const { searchNotes, courses, notes, settings } = useLibrary();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState(initialQuery);
  const [courseId, setCourseId] = useState('');
  const [language, setLanguage] = useState('');
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQuery(initialQuery);
    setActiveIndex(0);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open, initialQuery]);

  useEffect(() => {
    if (!open) return undefined;
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      setResults([]);
      setSearching(false);
      return undefined;
    }

    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(() => {
      void searchNotes({
        text: trimmed,
        courseId: courseId || undefined,
        language: language ? (language as SearchResult['language']) : undefined,
        favoriteOnly: favoriteOnly || undefined,
        limit: 8,
      })
        .then((found) => {
          if (!cancelled) {
            setResults(found);
            setActiveIndex(0);
          }
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 120);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, query, courseId, language, favoriteOnly, searchNotes]);

  const recentNotes = useMemo(
    () =>
      settings.recentNoteIds
        .map((id) => notes.find((note) => note.id === id))
        .filter((note): note is NonNullable<typeof note> => Boolean(note))
        .slice(0, 5),
    [settings.recentNoteIds, notes],
  );

  const showRecent = query.trim().length === 0;
  const navigable: Array<{ noteId: string }> = showRecent
    ? recentNotes.map((item) => ({ noteId: item.id }))
    : results;

  if (!open) return null;

  const openNote = (noteId: string): void => {
    navigate(ROUTES.note(noteId));
    onClose();
  };

  return (
    <div
      className={styles.scrim}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label="搜索"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            onClose();
          }
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActiveIndex((index) => Math.min(index + 1, Math.max(navigable.length - 1, 0)));
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActiveIndex((index) => Math.max(index - 1, 0));
          }
          if (event.key === 'Enter') {
            const target = navigable[activeIndex];
            if (target) openNote(target.noteId);
          }
        }}
      >
        <div className={styles.inputRow}>
          <Search size={17} aria-hidden style={{ color: 'var(--text-faint)' }} />
          <input
            ref={inputRef}
            className={styles.input}
            value={query}
            placeholder="搜索笔记标题、正文、代码和标签…"
            aria-label="搜索关键词"
            onChange={(event) => setQuery(event.target.value)}
          />
          {query ? (
            <IconButton icon={X} label="清空关键词" size="sm" onClick={() => setQuery('')} />
          ) : null}
          <IconButton icon={X} label="关闭搜索" size="sm" onClick={onClose} />
        </div>

        <div className={styles.filterRow}>
          <label className="visually-hidden" htmlFor="search-course">
            按课程筛选
          </label>
          <select
            id="search-course"
            className={styles.filterSelect}
            value={courseId}
            onChange={(event) => setCourseId(event.target.value)}
          >
            <option value="">全部课程</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name}
              </option>
            ))}
          </select>

          <label className="visually-hidden" htmlFor="search-language">
            按语言筛选
          </label>
          <select
            id="search-language"
            className={styles.filterSelect}
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
          >
            <option value="">全部语言</option>
            {LANGUAGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <Button
            size="sm"
            variant="ghost"
            icon={Star}
            selected={favoriteOnly}
            onClick={() => setFavoriteOnly((current) => !current)}
            aria-pressed={favoriteOnly}
          >
            只看收藏
          </Button>

          <span className={styles.footerSpacer} />
          <span className={styles.resultMeta}>
            {searching ? '搜索中…' : `${results.length} 条结果`}
          </span>
        </div>

        <div className={styles.results}>
          {showRecent ? (
            <>
              <div className={styles.groupLabel}>最近打开</div>
              {recentNotes.map((note, index) => (
                <button
                  key={note.id}
                  type="button"
                  className={clsx(styles.result, index === activeIndex && styles.resultActive)}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => openNote(note.id)}
                >
                  <span className={styles.resultTop}>
                    <FileText size={14} aria-hidden style={{ color: 'var(--text-faint)' }} />
                    <span className={styles.resultTitle}>{note.title}</span>
                    {note.favorite ? (
                      <Star
                        size={12}
                        aria-hidden
                        style={{ color: 'var(--warning-500)' }}
                        fill="currentColor"
                      />
                    ) : null}
                  </span>
                  <span className={styles.resultMeta}>
                    {note.courseName}
                    <span aria-hidden>·</span>
                    {formatRelativeTime(note.updatedAt)}
                  </span>
                </button>
              ))}
              {recentNotes.length === 0 ? (
                <div className={styles.empty}>
                  <div className={styles.emptyTitle}>还没有打开过笔记</div>
                  <p className={styles.emptyText}>输入关键词开始搜索，或先新建一篇笔记。</p>
                </div>
              ) : null}
            </>
          ) : null}

          {!showRecent
            ? results.map((result, index) => (
                <button
                  key={`${result.noteId}-${result.hitField}`}
                  type="button"
                  className={clsx(styles.result, index === activeIndex && styles.resultActive)}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => openNote(result.noteId)}
                >
                  <span className={styles.resultTop}>
                    <FileText size={14} aria-hidden style={{ color: 'var(--text-faint)' }} />
                    <span className={styles.resultTitle}>
                      <HighlightedText text={result.title} query={query} />
                    </span>
                    {result.favorite ? (
                      <Star
                        size={12}
                        aria-hidden
                        style={{ color: 'var(--warning-500)' }}
                        fill="currentColor"
                      />
                    ) : null}
                    <span className={styles.hitBadge}>{HIT_FIELD_LABEL[result.hitField]}</span>
                  </span>
                  <span
                    className={clsx(
                      styles.resultSnippet,
                      result.hitField === 'code' && styles.resultSnippetCode,
                    )}
                  >
                    <HighlightedText text={result.snippet} query={query} />
                  </span>
                  <span className={styles.resultMeta}>
                    {result.courseName}
                    <span aria-hidden>·</span>
                    {formatRelativeTime(result.updatedAt)}
                    {result.tags.slice(0, 2).map((tag) => (
                      <Tag key={tag} tone="subtle">
                        #{tag}
                      </Tag>
                    ))}
                  </span>
                </button>
              ))
            : null}

          {!showRecent && results.length === 0 && !searching ? (
            <div className={styles.empty}>
              <div className={styles.emptyTitle}>没有找到「{query.trim()}」相关的内容</div>
              <p className={styles.emptyText}>
                可以试试更短的关键词，去掉筛选条件，或换一个说法再搜一次。
              </p>
              <div className={styles.emptyActions}>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setQuery('');
                    setCourseId('');
                    setLanguage('');
                    setFavoriteOnly(false);
                    inputRef.current?.focus();
                  }}
                >
                  清空条件重新搜索
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    navigate(ROUTES.createWith('note'));
                    onClose();
                  }}
                >
                  新建一篇笔记
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        <div className={styles.footer}>
          <span className={styles.footerHint}>
            <CornerDownLeft size={12} aria-hidden />
            Enter 打开
          </span>
          <span className={styles.footerHint}>↑ ↓ 选择</span>
          <span className={styles.footerHint}>Esc 关闭</span>
          <span className={styles.footerSpacer} />
          <button
            type="button"
            className={styles.allResults}
            onClick={() => {
              navigate(ROUTES.searchWith(query));
              onClose();
            }}
          >
            在搜索页查看全部结果 →
          </button>
        </div>
      </div>
    </div>
  );
}
