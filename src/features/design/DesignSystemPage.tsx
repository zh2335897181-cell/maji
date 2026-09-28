import {
  BookPlus,
  ChevronRight,
  Code,
  Copy,
  FileText,
  Info,
  Lightbulb,
  ListChecks,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Search,
  Star,
  Terminal,
  TriangleAlert,
  Trash2,
} from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { ROUTES } from '../../app/routes';
import { useToast } from '../../app/ToastProvider';
import { Button, IconButton } from '../../components/ui/Button';
import { Checkbox, Kbd, SegmentedControl, SelectField, Switch, TextField, TextareaField } from '../../components/ui/Fields';
import { EmptyState } from '../../components/ui/EmptyState';
import { Menu } from '../../components/ui/Menu';
import { ConfirmDialog, Modal } from '../../components/ui/Modal';
import { StatusDot, Tag } from '../../components/ui/Tag';
import page from '../../components/layout/page.module.css';
import sidebar from '../../components/layout/AppSidebar.module.css';
import editor from '../notes/editor/editor.module.css';
import { COURSE_COLOR_KEYS, courseColorVar } from '../../lib/icons';
import styles from './design.module.css';

const TOKEN_GROUPS: Array<{ title: string; tokens: string[] }> = [
  {
    title: '品牌强调色（青蓝）',
    tokens: [
      '--accent-50',
      '--accent-100',
      '--accent-200',
      '--accent-400',
      '--accent-600',
      '--accent-700',
    ],
  },
  {
    title: '中性色（冷灰）',
    tokens: ['--ink-900', '--ink-700', '--ink-600', '--ink-500', '--line-strong', '--line'],
  },
  {
    title: '语义色（低饱和）',
    tokens: [
      '--success-600',
      '--success-bg',
      '--warning-600',
      '--warning-bg',
      '--danger-600',
      '--danger-bg',
    ],
  },
  {
    title: '笔记正文语义区块',
    tokens: ['--code-bg', '--output-bg', '--tip-bg', '--note-bg', '--bg-app', '--bg-surface'],
  },
];

const TYPE_SCALE = [
  { token: '--font-size-3xl / 24px', sample: '笔记标题', weight: 600 },
  { token: '--font-size-2xl / 20px', sample: '页面标题', weight: 600 },
  { token: '--font-size-xl / 17px', sample: '小节标题', weight: 600 },
  { token: '--font-size-lg / 15px', sample: '笔记正文（可调）', weight: 400 },
  { token: '--font-size-md / 14px', sample: '界面正文', weight: 400 },
  { token: '--font-size-sm / 13px', sample: '列表项、按钮', weight: 500 },
  { token: '--font-size-xs / 12px', sample: '辅助信息、时间戳', weight: 400 },
];

const SPACING = [4, 8, 12, 16, 20, 24, 32, 40, 48];

const RADIUS = [
  { token: 'xs 3px', radius: 'var(--radius-xs)' },
  { token: 'sm 4px', radius: 'var(--radius-sm)' },
  { token: 'md 6px', radius: 'var(--radius-md)' },
  { token: 'lg 8px', radius: 'var(--radius-lg)' },
  { token: 'xl 12px', radius: 'var(--radius-xl)' },
];

const SHADOWS = ['--shadow-xs', '--shadow-sm', '--shadow-md', '--shadow-lg'];

/** 设计规范画板：颜色、字体、间距、组件与状态矩阵 */
export function DesignSystemPage(): ReactElement {
  const toast = useToast();
  const [checkbox, setCheckbox] = useState(true);
  const [switchOn, setSwitchOn] = useState(false);
  const [segment, setSegment] = useState<'edit' | 'preview'>('edit');
  const [dialog, setDialog] = useState(false);
  const [confirm, setConfirm] = useState(false);

  return (
    <div className={page.page} data-scroll-container>
      <div className={`${page.inner} ${styles.wideInner}`}>
        <header className={page.pageHeader}>
          <div className={page.pageHeading}>
            <h1 className={page.pageTitle}>设计规范</h1>
            <p className={page.pageSubtitle}>
              颜色、字体、间距、圆角与组件状态的唯一来源。所有取值都来自
              <code className={styles.monoInline}> src/styles/tokens.css</code>
              ，组件不允许写死样式。
            </p>
          </div>
          <div className={page.pageActions}>
            <Link to={ROUTES.designStates}>
              <Button variant="secondary" icon={ChevronRight}>
                查看状态画板
              </Button>
            </Link>
          </div>
        </header>

        {TOKEN_GROUPS.map((group) => (
          <section className={styles.group} key={group.title}>
            <div className={styles.groupHead}>
              <h2 className={styles.groupTitle}>{group.title}</h2>
              <span className={styles.groupNote}>色板刻意保持低饱和，避免长时间阅读疲劳</span>
            </div>
            <div className={styles.specGrid}>
              {group.tokens.map((token) => (
                <div className={styles.swatchCard} key={token}>
                  <div className={styles.swatchColor} style={{ background: `var(${token})` }} />
                  <span className={styles.swatchName}>{token.replace('--', '')}</span>
                  <span className={styles.swatchToken}>{token}</span>
                </div>
              ))}
            </div>
            {group.title.startsWith('品牌') ? (
              <div className={styles.specGrid}>
                {COURSE_COLOR_KEYS.map((key) => (
                  <div className={styles.swatchCard} key={key}>
                    <div
                      className={styles.swatchColor}
                      style={{ background: courseColorVar(key, 'bg') }}
                    />
                    <span className={styles.swatchName}>课程 · {key}</span>
                    <span className={styles.swatchToken}>--course-{key}-fg</span>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        ))}

        <section className={styles.group}>
          <div className={styles.groupHead}>
            <h2 className={styles.groupTitle}>字体与字号</h2>
            <span className={styles.groupNote}>
              正文 {`{"--font-sans"}`} 中文无衬线；代码 {`{"--font-mono"}`} 等宽
            </span>
          </div>
          {TYPE_SCALE.map((item) => (
            <div className={styles.typeSample} key={item.token}>
              <span className={styles.typeMeta}>{item.token}</span>
              <span style={{ fontSize: `var(${item.token.split(' ')[0]})`, fontWeight: item.weight }}>
                {item.sample}
              </span>
              <span className={styles.monoSample}>
                def greet(name): return f&quot;你好，{'{name}'}！&quot;
              </span>
            </div>
          ))}
        </section>

        <section className={styles.group}>
          <div className={styles.groupHead}>
            <h2 className={styles.groupTitle}>间距与圆角</h2>
            <span className={styles.groupNote}>4px 基准，圆角克制统一</span>
          </div>
          {SPACING.map((value) => (
            <div className={styles.spacingRow} key={value}>
              <span className={styles.rowLabel}>{`--space-${value / 4} · ${value}px`}</span>
              <span className={styles.spacingBar} style={{ width: value * 3 }} />
            </div>
          ))}
          <div className={styles.radiusRow}>
            {RADIUS.map((item) => (
              <span className={styles.radiusBox} style={{ borderRadius: item.radius }} key={item.token}>
                {item.token}
              </span>
            ))}
          </div>
          <div className={styles.shadowRow}>
            {SHADOWS.map((token) => (
              <span className={styles.shadowBox} style={{ boxShadow: `var(${token})` }} key={token}>
                {token.replace('--', '')}
              </span>
            ))}
          </div>
        </section>

        <section className={styles.group}>
          <div className={styles.groupHead}>
            <h2 className={styles.groupTitle}>按钮</h2>
            <span className={styles.groupNote}>
              悬停 / 按下 / 选中 / 禁用状态可在本页直接交互查看
            </span>
          </div>
          <div className={styles.stateGrid}>
            <span className={styles.rowLabel}>主要按钮</span>
            <div className={styles.stateCell}>
              <Button variant="primary">新建笔记</Button>
              <span className={styles.stateLabel}>默认</span>
            </div>
            <div className={styles.stateCell}>
              <Button variant="primary" className={styles.demoHover}>
                新建笔记
              </Button>
              <span className={styles.stateLabel}>悬停</span>
            </div>
            <div className={styles.stateCell}>
              <Button variant="primary" className={styles.demoActive}>
                新建笔记
              </Button>
              <span className={styles.stateLabel}>按下</span>
            </div>
            <div className={styles.stateCell}>
              <Button variant="primary" loading>
                正在保存
              </Button>
              <span className={styles.stateLabel}>加载中</span>
            </div>
            <div className={styles.stateCell}>
              <Button variant="primary" disabled>
                新建笔记
              </Button>
              <span className={styles.stateLabel}>禁用</span>
            </div>
            <div className={styles.stateCell}>
              <Button variant="primary" icon={Plus}>
                带图标
              </Button>
              <span className={styles.stateLabel}>图标 + 文案</span>
            </div>

            <span className={styles.rowLabel}>次要按钮</span>
            <div className={styles.stateCell}>
              <Button variant="secondary">取消</Button>
              <span className={styles.stateLabel}>默认</span>
            </div>
            <div className={styles.stateCell}>
              <Button variant="ghost" icon={RotateCcw} className={styles.demoSelected}>
                已选中
              </Button>
              <span className={styles.stateLabel}>选中</span>
            </div>
            <div className={styles.stateCell}>
              <Button variant="soft">继续学习</Button>
              <span className={styles.stateLabel}>柔和强调</span>
            </div>
            <div className={styles.stateCell}>
              <Menu
                label="更多操作"
                icon={MoreHorizontal}
                items={[
                  { id: 'a', label: '重命名', onSelect: () => toast.show('已选择：重命名') },
                  { id: 'b', label: '移动到课程…', onSelect: () => toast.show('已选择：移动') },
                  { id: 's', separator: true },
                  { id: 'c', label: '删除笔记', danger: true, onSelect: () => setConfirm(true) },
                ]}
              />
              <span className={styles.stateLabel}>下拉菜单</span>
            </div>
            <div className={styles.stateCell}>
              <Button variant="danger" icon={Trash2} onClick={() => setConfirm(true)}>
                删除
              </Button>
              <span className={styles.stateLabel}>危险操作</span>
            </div>

            <span className={styles.rowLabel}>尺寸</span>
            <div className={styles.stateCell}>
              <Button size="sm" variant="secondary">
                小 28px
              </Button>
              <span className={styles.stateLabel}>sm</span>
            </div>
            <div className={styles.stateCell}>
              <Button size="md" variant="secondary">
                中 32px
              </Button>
              <span className={styles.stateLabel}>md（默认）</span>
            </div>
            <div className={styles.stateCell}>
              <Button size="lg" variant="secondary">
                大 36px
              </Button>
              <span className={styles.stateLabel}>lg</span>
            </div>
            <div className={styles.stateCell}>
              <span className={styles.row}>
                <IconButton icon={Star} label="收藏" active />
                <IconButton icon={Copy} label="复制" />
                <IconButton icon={Trash2} label="删除" tone="danger" />
                <IconButton icon={Info} label="禁用示例" disabled />
              </span>
              <span className={styles.stateLabel}>图标按钮</span>
            </div>
            <div className={styles.stateCell}>
              <span className={styles.row}>
                <Kbd>Ctrl</Kbd>
                <Kbd>K</Kbd>
              </span>
              <span className={styles.stateLabel}>快捷键</span>
            </div>
          </div>
        </section>

        <section className={styles.group}>
          <div className={styles.groupHead}>
            <h2 className={styles.groupTitle}>输入控件</h2>
            <span className={styles.groupNote}>字段说明与示例始终可见，错误状态用红色 + 文案双重提示</span>
          </div>
          <div className={styles.twoColumn}>
            <div className={styles.statePanel}>
              <TextField
                label="笔记标题"
                hint="必填"
                example="函数与参数"
                placeholder="例如：函数与参数"
              />
            </div>
            <div className={styles.statePanel}>
              <TextField
                label="课程名称"
                error="课程名称不能超过 40 个字符"
                defaultValue="Python 入门（第 3 周 · 函数与模块 · 参数与返回值 · 作用域）"
              />
            </div>
            <div className={styles.statePanel}>
              <TextField label="已禁用的输入框" defaultValue="不可编辑" disabled />
            </div>
            <div className={styles.statePanel}>
              <SelectField
                label="编程语言"
                value="python"
                options={[
                  { value: 'python', label: 'Python' },
                  { value: 'javascript', label: 'JavaScript' },
                ]}
                onChange={() => undefined}
              />
            </div>
            <div className={styles.statePanel}>
              <TextareaField label="题目要求" example="编写一个函数，接收两个数字并返回它们的和。" />
            </div>
            <div className={styles.statePanel}>
              <div className={styles.row}>
                <Checkbox checked={checkbox} onChange={setCheckbox} label="关联到当前笔记" />
              </div>
              <div className={`${styles.row} ${styles.rowSpaced}`}>
                <Switch checked={switchOn} onChange={setSwitchOn} label="深色主题" />
              </div>
              <div className={`${styles.row} ${styles.rowSpaced}`}>
                <SegmentedControl<'edit' | 'preview'>
                  label="编辑与预览"
                  value={segment}
                  onChange={setSegment}
                  options={[
                    { value: 'edit', label: '编辑' },
                    { value: 'preview', label: '预览' },
                  ]}
                />
              </div>
            </div>
          </div>
        </section>

        <section className={styles.group}>
          <div className={styles.groupHead}>
            <h2 className={styles.groupTitle}>标签、状态点与列表行</h2>
            <span className={styles.groupNote}>标签用低饱和语义色，状态点只在必要时出现</span>
          </div>
          <div className={styles.statePanel}>
            <div className={styles.row}>
              <Tag>Python</Tag>
              <Tag tone="accent">基础语法</Tag>
              <Tag tone="success">已掌握</Tag>
              <Tag tone="warning">待复习</Tag>
              <Tag tone="danger">已逾期 2 天</Tag>
              <Tag mono>css</Tag>
              <Tag tone="subtle">#函数</Tag>
              <Tag onRemove={() => toast.show('已移除标签')}>可移除</Tag>
            </div>
            <div className={`${styles.row} ${styles.rowSpaced}`}>
              <StatusDot tone="today" />
              <span className={styles.stateLabel}>待复习</span>
              <StatusDot tone="soon" />
              <span className={styles.stateLabel}>即将到期</span>
              <StatusDot tone="mastered" />
              <span className={styles.stateLabel}>已掌握</span>
              <StatusDot tone="neutral" />
              <span className={styles.stateLabel}>未排期</span>
            </div>
          </div>

          <div className={styles.twoColumn}>
            <div className={`${styles.statePanel} ${styles.panelFlush}`}>
              <nav className={styles.demoNav}>
                <span className={sidebar.navItem}>
                  <FileText size={16} aria-hidden />
                  <span className={sidebar.navLabel}>学习首页</span>
                </span>
                <span className={`${sidebar.navItem} ${sidebar.navItemActive}`}>
                  <ListChecks size={16} aria-hidden />
                  <span className={sidebar.navLabel}>复习</span>
                  <span className={`${sidebar.navBadge} ${sidebar.navBadgeAccent}`}>5</span>
                </span>
                <span className={sidebar.navItem}>
                  <Search size={16} aria-hidden />
                  <span className={sidebar.navLabel}>搜索</span>
                  <span className={sidebar.navHint}>Ctrl K</span>
                </span>
              </nav>
            </div>

            <div className={`${styles.statePanel} ${styles.panelFlush}`}>
              <div className={page.listRow}>
                <span className={page.rowMain}>
                  <span className={page.rowTitle}>函数与参数</span>
                  <span className={page.rowMeta}>
                    <Tag mono>Python</Tag>
                    <span>42 分钟前更新</span>
                    <StatusDot tone="soon" />
                    <span>明天复习</span>
                  </span>
                </span>
                <span className={page.rowActions}>
                  <IconButton icon={Star} label="收藏" size="sm" />
                  <IconButton icon={Copy} label="复制" size="sm" />
                </span>
              </div>
              <div className={page.listRow}>
                <span className={page.rowMain}>
                  <span className={page.rowTitle}>CSS 盒模型</span>
                  <span className={page.rowMeta}>
                    <Tag mono>CSS</Tag>
                    <span>昨天 21:10 更新</span>
                    <StatusDot tone="today" />
                    <span>已逾期 1 天</span>
                  </span>
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.group}>
          <div className={styles.groupHead}>
            <h2 className={styles.groupTitle}>笔记正文区块</h2>
            <span className={styles.groupNote}>
              解释文字、代码、运行结果、提示四种内容在视觉上必须一眼可分
            </span>
          </div>
          <div className={styles.statePanel}>
            <p className={styles.bodySample}>
              函数可以把一段可重复使用的逻辑组织起来，并通过参数接收外部数据。
            </p>

            <div className={editor.codeBlock}>
              <div className={editor.codeHeader} contentEditable={false}>
                <span className={editor.langSelect} style={{ cursor: 'default' }}>
                  python
                </span>
                <span className={editor.codeHint}>Python 代码</span>
                <button
                  type="button"
                  className={editor.copyButton}
                  onClick={() => toast.show('已复制')}
                >
                  <Copy size={13} aria-hidden />
                  复制
                </button>
              </div>
              <pre className={editor.codeReadonly}>
                <code className={editor.codeText}>
                  {'def greet(name):\n    return f"你好，{name}！"\n\nmessage = greet("小林")\nprint(message)'}
                </code>
              </pre>
            </div>

            <div className={editor.callout} data-variant="output">
              <div className={editor.calloutHeader}>
                <Terminal size={15} aria-hidden className={editor.calloutIcon} />
                <span className={editor.calloutLabel}>运行结果</span>
              </div>
              <div className={editor.calloutBody}>
                <p>你好，小林！</p>
              </div>
            </div>

            <div className={editor.callout} data-variant="tip">
              <div className={editor.calloutHeader}>
                <Lightbulb size={15} aria-hidden className={editor.calloutIcon} />
                <span className={editor.calloutLabel}>容易混淆</span>
              </div>
              <div className={editor.calloutBody}>
                <p>return 会把结果交还给调用者；print 只负责显示内容。</p>
              </div>
            </div>

            <div className={editor.callout} data-variant="warning">
              <div className={editor.calloutHeader}>
                <TriangleAlert size={15} aria-hidden className={editor.calloutIcon} />
                <span className={editor.calloutLabel}>常见报错</span>
              </div>
              <div className={editor.calloutBody}>
                <p>少传一个参数时 Python 会直接报错。</p>
              </div>
            </div>

            <div className={editor.callout} data-variant="note">
              <div className={editor.calloutHeader}>
                <Info size={15} aria-hidden className={editor.calloutIcon} />
                <span className={editor.calloutLabel}>说明</span>
              </div>
              <div className={editor.calloutBody}>
                <p>导入写在文件顶部，先标准库、再第三方、最后自己的模块。</p>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.group}>
          <div className={styles.groupHead}>
            <h2 className={styles.groupTitle}>空状态与浮层</h2>
            <span className={styles.groupNote}>空状态必须给出下一步动作，浮层只在需要打断时使用</span>
          </div>
          <div className={styles.twoColumn}>
            <div className={styles.statePanel}>
              <EmptyState
                icon={BookPlus}
                compact
                title="还没有课程"
                description="创建第一门课程后，就可以往里面记录笔记了。"
                actions={
                  <Button variant="primary" size="sm" icon={Plus} onClick={() => toast.show('示例：创建课程')}>
                    创建课程
                  </Button>
                }
              />
            </div>
            <div className={styles.statePanel}>
              <EmptyState
                icon={Code}
                compact
                title="这门课程还没有笔记"
                description="可以从课堂知识点、代码示例或报错记录开始。"
                actions={
                  <>
                    <Button variant="primary" size="sm" onClick={() => toast.show('示例：新建笔记')}>
                      新建笔记
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => setDialog(true)}>
                      查看对话框
                    </Button>
                  </>
                }
              />
            </div>
          </div>
        </section>
      </div>

      <Modal
        open={dialog}
        onClose={() => setDialog(false)}
        title="模态框示例"
        description="用于需要用户确认或填写少量信息的场景，Esc 可关闭。"
        icon={Info}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(false)}>
              取消
            </Button>
            <Button variant="primary" onClick={() => setDialog(false)}>
              确定
            </Button>
          </>
        }
      >
        <TextField label="片段名称" example="用 f-string 拼接字符串" />
      </Modal>

      <ConfirmDialog
        open={confirm}
        title="删除这篇笔记？"
        description="删除后无法恢复，关联的复习知识点会一并移除。"
        icon={Trash2}
        confirmLabel="删除笔记"
        details={
          <div className={styles.deleteSummary}>
            <strong className={styles.deleteSummaryName}>函数与参数</strong>
            <span className={styles.deleteSummaryMeta}>Python 入门 · 约 320 字 · 3 段代码</span>
          </div>
        }
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          toast.show({ message: '已删除「函数与参数」', tone: 'info' });
        }}
      />
    </div>
  );
}
