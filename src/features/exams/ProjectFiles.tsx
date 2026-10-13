import { useEffect, useRef, useState } from 'react';
import { FILE_ROLES, categoryName, validateProjectFile, type ProjectFile } from '../../lib/exams';
import { inferFileRole } from '../../lib/programmingModules';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
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
  categories = [],
  onCategoriesChange,
  onImporting,
}: {
  files: ProjectFile[];
  selected: string;
  onSelect: (id: string) => void;
  onChange: (files: ProjectFile[]) => void;
  onAppend: (files: ProjectFile[]) => void;
  disabled?: boolean;
  line?: number;
  categories?: string[];
  onCategoriesChange?: (categories: string[], files: ProjectFile[]) => void;
  onImporting?: (busy: boolean) => void;
}) {
  const [error, setError] = useState(''),
    input = useRef<HTMLInputElement>(null),
    code = useRef<HTMLTextAreaElement>(null);
  const file = files.find((f) => f.id === selected) ?? files[0];
  const [manageOpen, setManageOpen] = useState(false),
    [categoryDraft, setCategoryDraft] = useState(''),
    [renameTarget, setRenameTarget] = useState(''),
    [importCategory, setImportCategory] = useState('auto');
  const roles = [...new Set([...FILE_ROLES, ...categories, ...files.map((f) => f.role)])];
  const groups = roles.filter(
    (role) => categories.includes(role) || files.some((f) => f.role === role),
  );
  function changeCategory(operation: 'add' | 'rename' | 'remove') {
    if (!onCategoriesChange) return;
    setError('');
    try {
      if (operation === 'remove') {
        onCategoriesChange(
          categories.filter((c) => c !== renameTarget),
          files.map((f) => (f.role === renameTarget ? { ...f, role: '其他' } : f)),
        );
        setRenameTarget('');
        setCategoryDraft('');
        return;
      }
      const name = categoryName(categoryDraft);
      if (
        roles.some(
          (role) =>
            role.toLowerCase() === name.toLowerCase() &&
            !(operation === 'rename' && role === renameTarget),
        )
      )
        throw new Error('分类名称已存在');
      if (operation === 'add') {
        if (categories.length >= 30) throw new Error('每个模块最多 30 个自定义分类');
        onCategoriesChange([...categories, name], files);
      } else {
        if (!renameTarget) throw new Error('请选择要重命名的分类');
        onCategoriesChange(
          categories.map((c) => (c === renameTarget ? name : c)),
          files.map((f) => (f.role === renameTarget ? { ...f, role: name } : f)),
        );
        setRenameTarget(name);
      }
      setCategoryDraft('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '分类保存失败');
    }
  }
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
    onImporting?.(true);
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
            role:
              importCategory === 'auto' || !roles.includes(importCategory)
                ? inferFileRole(item.webkitRelativePath || item.name, content)
                : importCategory,
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
      onImporting?.(false);
    }
  };
  return (
    <section className={styles.files} aria-label="项目代码">
      <div className={styles.actions}>
        <h3>项目代码 · {files.length} 个文件</h3>
        {onCategoriesChange && (
          <button
            disabled={disabled}
            onClick={() => {
              setManageOpen(true);
              setError('');
            }}
          >
            管理分类
          </button>
        )}
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
      <label className={styles.importCategory}>
        导入分类
        <select
          aria-label="导入文件分类"
          value={
            roles.includes(importCategory) || importCategory === 'auto' ? importCategory : 'auto'
          }
          disabled={disabled}
          onChange={(e) => setImportCategory(e.target.value)}
        >
          <option value="auto">自动识别（可手动调整）</option>
          {roles.map((role) => (
            <option key={role}>{role}</option>
          ))}
        </select>
      </label>
      {error && <p role="alert">{error}</p>}
      <div className={styles.fileLayout}>
        <nav aria-label="项目文件树">
          {groups.map((role) => (
            <div className={styles.fileGroup} key={role}>
              <h4>
                {role} <span>{files.filter((f) => f.role === role).length}</span>
              </h4>
              {files
                .filter((f) => f.role === role)
                .map((f) => (
                  <div key={f.id}>
                    <button aria-pressed={f.id === file?.id} onClick={() => onSelect(f.id)}>
                      {f.path}
                      <small>{f.role}</small>
                    </button>
                    <label className={styles.fileToggle}>
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
                文件分类
                <select
                  aria-label="文件层级"
                  value={file.role}
                  disabled={disabled}
                  onChange={(e) => patch({ role: e.target.value })}
                >
                  {roles.map((role) => (
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
      <Modal
        open={manageOpen}
        title="管理文件分类"
        footer={
          <Button
            onClick={() => {
              setManageOpen(false);
              setError('');
            }}
          >
            关闭
          </Button>
        }
        onClose={() => {
          setManageOpen(false);
          setError('');
        }}
        description="分类只属于当前题目；重命名和移除分类不会修改其他题目。移除分类后，文件保留并归入其他。"
      >
        <div className={styles.dialogForm}>
          <label>
            分类名称
            <input
              aria-label="分类名称"
              maxLength={60}
              value={categoryDraft}
              onChange={(e) => setCategoryDraft(e.target.value)}
              placeholder="例如：请求 DTO、工具类、启动类"
            />
          </label>
          <Button onClick={() => changeCategory('add')}>添加分类</Button>
          {!!categories.length && (
            <>
              <label>
                已有自定义分类
                <select
                  aria-label="选择自定义分类"
                  value={renameTarget}
                  onChange={(e) => {
                    setRenameTarget(e.target.value);
                    setCategoryDraft(e.target.value);
                  }}
                >
                  <option value="">请选择</option>
                  {categories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <div className={styles.actions}>
                <Button disabled={!renameTarget} onClick={() => changeCategory('rename')}>
                  重命名分类
                </Button>
                <Button
                  disabled={!renameTarget}
                  variant="secondary"
                  onClick={() => changeCategory('remove')}
                >
                  移除分类，保留文件
                </Button>
              </div>
            </>
          )}
          {error && <p role="alert">{error}</p>}
        </div>
      </Modal>
    </section>
  );
}
