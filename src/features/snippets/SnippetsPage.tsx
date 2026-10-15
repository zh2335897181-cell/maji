import { useMemo, useState, type ReactElement } from 'react';
import { Code2, Copy, Plus, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLibrary } from '../../app/LibraryProvider';
import { ROUTES } from '../../app/routes';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import styles from './snippets.module.css';

export function SnippetsPage(): ReactElement {
  const { snippets } = useLibrary();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    return [...snippets].filter((item) => !value || `${item.title} ${item.description} ${item.code} ${item.language}`.toLowerCase().includes(value));
  }, [query, snippets]);
  const copy = async (id: string, code: string) => {
    await navigator.clipboard?.writeText(code);
    setCopied(id);
    window.setTimeout(() => setCopied((current) => current === id ? null : current), 1400);
  };
  return <main className={styles.page} data-scroll-container>
    <header className={styles.header}>
      <div><div className={styles.eyebrow}><Code2 size={16} /> 独立内容模块</div><h1>代码片段</h1><p>集中保存可复用代码、说明和运行结果，不再混在课程笔记里。</p></div>
      <Button icon={Plus} variant="primary" onClick={() => navigate(ROUTES.createWith('snippet'))}>新建代码片段</Button>
    </header>
    <div className={styles.toolbar}><Search size={16} /><input aria-label="搜索代码片段" placeholder="搜索名称、语言或代码…" value={query} onChange={(event) => setQuery(event.target.value)} /><span>{filtered.length} 个片段</span></div>
    {!filtered.length ? <EmptyState icon={Code2} title={query ? '没有找到匹配片段' : '还没有代码片段'} description={query ? '换个关键词试试。' : '把可复用的代码独立保存下来，之后可以随时查找。'} actions={!query ? <Button icon={Plus} onClick={() => navigate(ROUTES.createWith('snippet'))}>创建第一个片段</Button> : undefined} /> : <section className={styles.grid} aria-label="代码片段列表">
      {filtered.map((item) => <article className={styles.card} key={item.id}>
        <div className={styles.cardTop}><div><h2>{item.title}</h2><span className={styles.meta}>{item.language}{item.courseId ? ' · 已关联课程' : ' · 独立片段'}</span></div><Button size="sm" icon={Copy} onClick={() => void copy(item.id, item.code)}>{copied === item.id ? '已复制' : '复制代码'}</Button></div>
        {item.description ? <p className={styles.description}>{item.description}</p> : null}
        <pre><code>{item.code}</code></pre>
        {item.output ? <div className={styles.output}><strong>运行结果</strong><span>{item.output}</span></div> : null}
        {item.noteId ? <button className={styles.link} onClick={() => navigate(ROUTES.note(item.noteId!))}>打开关联笔记 →</button> : null}
      </article>)}
    </section>}
  </main>;
}
