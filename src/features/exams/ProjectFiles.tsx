import { useEffect, useRef, useState } from 'react';
import { FILE_ROLES, validateProjectFile, type ProjectFile } from '../../lib/exams';
import { createId } from '../../lib/text';
import styles from './exam.module.css';
const extensions =
  /\.(java|xml|yml|yaml|properties|json|js|jsx|ts|tsx|html|css|py|c|h|cpp|cs|go|rs|sql|txt|md)$/i;
export function ProjectFiles({
  files,
  selected,
  onSelect,
  onChange,
  onAppend,
  disabled = false,
  line = 0,
}: {
  files: ProjectFile[];
  selected: string;
  onSelect: (id: string) => void;
  onChange: (files: ProjectFile[]) => void;
  onAppend: (files: ProjectFile[]) => void;
  disabled?: boolean;
  line?: number;
}) {
  const [error, setError] = useState(''),
    input = useRef<HTMLInputElement>(null),
    code = useRef<HTMLTextAreaElement>(null);
  const file = files.find((f) => f.id === selected) ?? files[0];
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  const patch = (change: Partial<ProjectFile>) => {
    if (file) onChange(files.map((f) => (f.id === file.id ? { ...f, ...change } : f)));
  };
  const add = () => {
    const item = {
      id: createId('file'),
      path: `File${files.length + 1}.java`,
      role: '其他',
      language: 'java',
      content: '',
    };
    onChange([...files, item]);
    onSelect(item.id);
  };
  const importFiles = async (list: FileList | null) => {
    if (!list) return;
    setError('');
    try {
      if (files.length + list.length > 40) throw new Error('每题最多 40 个项目文件');
      const imported = await Promise.all(
        Array.from(list).map(async (item) => {
          if (!extensions.test(item.name) || item.size > 400000)
            throw new Error(`${item.name} 不是受支持的文本文件或超过大小限制`);
          const content = await item.text();
          if (content.includes('\0')) throw new Error('不支持二进制文件');
          return validateProjectFile({
            id: createId('file'),
            path: item.webkitRelativePath || item.name,
            role: '其他',
            language: item.name.split('.').pop() ?? 'text',
            content,
          });
        }),
      );
      if (!live.current) return;
      onAppend(imported);
      if (imported[0]) onSelect(imported[0].id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '导入失败');
    } finally {
      if (input.current) input.current.value = '';
    }
  };
  return (
    <section className={styles.files} aria-label="项目代码">
      <div className={styles.actions}>
        <h3>项目代码 · {files.length} 个文件</h3>
        <button disabled={disabled || files.length >= 40} onClick={add}>
          添加文件
        </button>
        <button disabled={disabled} onClick={() => input.current?.click()}>
          导入多个文件
        </button>
        <input
          hidden
          ref={input}
          type="file"
          multiple
          accept=".java,.xml,.yml,.yaml,.properties,.json,.js,.jsx,.ts,.tsx,.html,.css,.py,.c,.h,.cpp,.cs,.go,.rs,.sql,.txt,.md"
          onChange={(e) => void importFiles(e.target.files)}
        />
      </div>
      {error && <p role="alert">{error}</p>}
      <div className={styles.fileLayout}>
        <nav aria-label="项目文件树">
          {files.map((f) => (
            <div key={f.id}>
              <button aria-pressed={f.id === file?.id} onClick={() => onSelect(f.id)}>
                {f.path}
                <small>{f.role}</small>
              </button>
              <label>
                <input
                  type="checkbox"
                  disabled={disabled}
                  aria-label={`${f.path}参与AI分析`}
                  checked={f.includeInAI !== false}
                  onChange={(e) =>
                    onChange(
                      files.map((item) =>
                        item.id === f.id ? { ...item, includeInAI: e.target.checked } : item,
                      ),
                    )
                  }
                />
                参与 AI 分析
              </label>
            </div>
          ))}
        </nav>
        {file ? (
          <div>
            <div className={styles.fileMeta}>
              <label>
                文件路径
                <input
                  aria-label="文件路径"
                  value={file.path}
                  disabled={disabled}
                  onChange={(e) => patch({ path: e.target.value })}
                />
              </label>
              <label>
                层级
                <select
                  aria-label="文件层级"
                  value={file.role}
                  disabled={disabled}
                  onChange={(e) => patch({ role: e.target.value })}
                >
                  {FILE_ROLES.map((role) => (
                    <option key={role}>{role}</option>
                  ))}
                </select>
              </label>
              <button
                disabled={disabled}
                onClick={() => {
                  onChange(files.filter((f) => f.id !== file.id));
                  onSelect('');
                }}
              >
                移除文件
              </button>
            </div>
            {line > 0 && (
              <p className={styles.lineHint}>
                引用位置：第 {line} 行{' '}
                <button
                  onClick={() => {
                    const offset =
                      file.content
                        .split('\n')
                        .slice(0, line - 1)
                        .join('\n').length + (line > 1 ? 1 : 0);
                    code.current?.focus();
                    code.current?.setSelectionRange(
                      offset,
                      offset + (file.content.split('\n')[line - 1]?.length ?? 0),
                    );
                  }}
                >
                  定位代码
                </button>
              </p>
            )}
            <textarea
              ref={code}
              className={styles.code}
              aria-label="项目文件内容"
              spellCheck={false}
              value={file.content}
              disabled={disabled}
              onChange={(e) => patch({ content: e.target.value })}
            />
          </div>
        ) : (
          <p>粘贴或导入 Controller、Service、Mapper、配置等文本文件。仅保存与分析，不执行代码。</p>
        )}
      </div>
    </section>
  );
}
