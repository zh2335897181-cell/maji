import { FileText, Plus, Search, SlidersHorizontal, Star, X } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useLibrary } from '../../app/LibraryProvider';
import { ROUTES } from '../../app/routes';
import { Button, IconButton } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { SelectField } from '../../components/ui/Fields';
import { Kbd } from '../../components/ui/Fields';
import { HighlightedText, Tag } from '../../components/ui/Tag';
import page from '../../components/layout/page.module.css';
import { formatRelativeTime } from '../../lib/format';
import { LANGUAGE_OPTIONS } from '../../lib/languages';
import { HIT_FIELD_LABEL } from '../../lib/search';
import type { LanguageId, SearchResult } from '../../lib/types';
import styles from './search.module.css';

const SUGGESTIONS = ['return', 'range', '盒模型', 'Flex', '闭包', '报错'];

/** 搜索页：按标题、正文、代码、标签检索，带课程 / 语言 / 收藏筛选 */
export function SearchPage(): ReactElement {
  const { searchNotes, courses } = useLibrary();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();

  const [text, setText] = useState(params.get('q') ?? '');
  const [courseId, setCourseId] = useState('');
  const [language, setLanguage] = useState('');
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [includeCode, setIncludeCode] = useState(true);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  // URL 里的 q 变化时同步输入框（从浮层跳转过来）
  const urlQuery = params.get('q') ?? '';
  useEffect(() => {
    setText(urlQuery);
  }, [urlQuery]);

  useEffect(() => {
    const trimmed = text.trim();
    if (!trimmed) {
      setResults([]);
      return undefined;
    }
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(() => {
      void searchNotes({
        text: trimmed,
        courseId: courseId || undefined,
        language: language ? (language as LanguageId) : undefined,
        favoriteOnly: favoriteOnly || undefined,
        includeCode,
        limit: 60,
      })
        .then((found) => {
          if (!cancelled) setResults(found);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 140);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [text, courseId, language, favoriteOnly, includeCode, searchNotes]);

  const hasQuery = text.trim().length > 0;
  const filterActive = Boolean(courseId || language || favoriteOnly || !includeCode);

  const submit = (value: string): void => {
    setParams(value ? { q: value } : {});
  };

  const resultSummary = useMemo(() => {
    if (!hasQuery) return '';
    if (searching) return '正在搜索…';
    return `找到 ${results.length} 条${filterActive ? '（已筛选）' : ''}`;
  }, [hasQuery, searching, results.length, filterActive]);

  return (
    <div className={page.page} data-scroll-container>
      <div className={page.inner}>
        <header className={page.pageHeader}>
          <div className={page.pageHeading}>
            <h1 className={page.pageTitle}>搜索</h1>
            <p className={page.pageSubtitle}>
              同时搜索笔记标题、正文、代码块和标签。输入一个关键词，例如 return 或 盒模型。
            </p>
          </div>
          <div className={page.pageActions}>
            <Button variant="secondary" icon={Plus} onClick={() => navigate(ROUTES.createWith('note'))}>
              新建笔记
            </Button>
          </div>
        </header>

        <div className={styles.searchBar}>
          <Search size={18} aria-hidden style={{ color: 'var(--text-faint)' }} />
          <input
            className={styles.searchInput}
            value={text}
            autoFocus
            aria-label="搜索关键词"
            placeholder="搜索笔记标题、正文、代码和标签…"
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submit(text.trim());
            }}
          />
          {text ? (
            <IconButton
              icon={X}
              label="清空关键词"
              size="sm"
              onClick={() => {
                setText('');
                submit('');
              }}
            />
          ) : null}
          <Kbd>Ctrl K</Kbd>
        </div>

        <div className={styles.filters}>
          <SlidersHorizontal size={14} aria-hidden style={{ color: 'var(--text-faint)' }} />

          <div className={styles.selectSmall}>
            <SelectField
              aria-label="按课程筛选"
              value={courseId}
              onChange={(event) => setCourseId(event.target.value)}
              options={[
                { value: '', label: '全部课程' },
                ...courses.map((course) => ({ value: course.id, label: course.name })),
              ]}
            />
          </div>

          <div className={styles.selectSmall}>
            <SelectField
              aria-label="按语言筛选"
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
              options={[{ value: '', label: '全部语言' }, ...LANGUAGE_OPTIONS]}
            />
          </div>

          <Button
            size="sm"
            variant="ghost"
            icon={Star}
            selected={favoriteOnly}
            aria-pressed={favoriteOnly}
            onClick={() => setFavoriteOnly((current) => !current)}
          >
            只看收藏
          </Button>

          <Button
            size="sm"
            variant="ghost"
            selected={includeCode}
            aria-pressed={includeCode}
            onClick={() => setIncludeCode((current) => !current)}
          >
            搜索代码内容
          </Button>

          {filterActive ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setCourseId('');
                setLanguage('');
                setFavoriteOnly(false);
                setIncludeCode(true);
              }}
            >
              重置筛选
            </Button>
          ) : null}
        </div>

        {!hasQuery ? (
          <>
            <div className={styles.tips}>
              <span className={styles.tipLabel}>试试这些关键词：</span>
              {SUGGESTIONS.map((suggestion) => (
                <Tag
                  key={suggestion}
                  onClick={() => {
                    setText(suggestion);
                    submit(suggestion);
                  }}
                >
                  {suggestion}
                </Tag>
              ))}
            </div>
            <EmptyState
              icon={Search}
              title="输入关键词开始搜索"
              description="搜索会覆盖笔记标题、正文、代码块与标签。收藏的笔记和最近更新的内容会排在前面。"
            />
          </>
        ) : (
          <>
            <div className={styles.summary}>
              <span>{resultSummary}</span>
              {results.length > 0 ? (
                <span>按相关度排序 · 标题命中的结果优先</span>
              ) : null}
            </div>

            {results.length === 0 && !searching ? (
              <EmptyState
                icon={Search}
                title={`没有找到「${text.trim()}」相关的内容`}
                description="可以试试更短的关键词、去掉筛选条件，或换一个说法再搜一次。"
                actions={
                  <>
                    <Button
                      variant="primary"
                      onClick={() => {
                        setText('');
                        submit('');
                        setCourseId('');
                        setLanguage('');
                        setFavoriteOnly(false);
                        setIncludeCode(true);
                      }}
                    >
                      清空条件重新搜索
                    </Button>
                    <Button
                      variant="secondary"
                      icon={Plus}
                      onClick={() => navigate(ROUTES.createWith('note'))}
                    >
                      新建一篇笔记
                    </Button>
                  </>
                }
              />
            ) : (
              <div className={page.panel}>
                <div className={styles.resultList}>
                  {results.map((result) => (
                    <Link
                      key={`${result.noteId}-${result.hitField}`}
                      className={styles.result}
                      to={ROUTES.note(result.noteId)}
                    >
                      <span className={styles.resultTop}>
                        <FileText size={14} aria-hidden style={{ color: 'var(--text-faint)' }} />
                        <span className={styles.resultTitle}>
                          <HighlightedText text={result.title} query={text} />
                        </span>
                        {result.favorite ? (
                          <Star
                            size={12}
                            aria-label="已收藏"
                            style={{ color: 'var(--warning-500)' }}
                            fill="currentColor"
                          />
                        ) : null}
                        <span className={styles.hitBadge}>{HIT_FIELD_LABEL[result.hitField]}</span>
                      </span>

                      <span
                        className={`${styles.snippet} ${
                          result.hitField === 'code' ? styles.snippetCode : ''
                        }`}
                      >
                        <HighlightedText text={result.snippet} query={text} />
                      </span>

                      <span className={styles.resultMeta}>
                        {result.courseName}
                        <span aria-hidden>·</span>
                        {formatRelativeTime(result.updatedAt)}更新
                        {result.tags.slice(0, 3).map((tag) => (
                          <Tag key={tag} tone="subtle">
                            #{tag}
                          </Tag>
                        ))}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
