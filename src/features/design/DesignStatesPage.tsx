import {
  BookPlus,
  CircleAlert,
  CircleCheck,
  FileText,
  Info,
  LoaderCircle,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { useLibrary } from '../../app/LibraryProvider';
import { ROUTES } from '../../app/routes';
import { useToast } from '../../app/ToastProvider';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { ConfirmDialog } from '../../components/ui/Modal';
import { SectionTitle } from '../../components/ui/Tag';
import page from '../../components/layout/page.module.css';
import { formatSavedAt } from '../../lib/format';
import type { SaveStatus } from '../../lib/types';
import styles from './design.module.css';

const SAVE_STATES: Array<{ status: SaveStatus; label: string; note: string }> = [
  { status: 'dirty', label: '有未保存的修改', note: '用户停止输入前' },
  { status: 'saving', label: '正在保存…', note: '写入本机数据库时' },
  { status: 'saved', label: '已保存', note: '写入成功后（默认停留）' },
  { status: 'error', label: '保存失败', note: '磁盘或权限异常时' },
];

/** 状态画板：空状态、保存状态、轻提示、确认对话框、加载状态 */
export function DesignStatesPage(): ReactElement {
  const toast = useToast();
  const { setSaveState, saveState } = useLibrary();
  const [confirmNote, setConfirmNote] = useState(false);
  const [confirmCourse, setConfirmCourse] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <div className={page.page} data-scroll-container>
      <div className={`${page.inner} ${styles.boardInner}`}>
        <header className={page.pageHeader}>
          <div className={page.pageHeading}>
            <h1 className={page.pageTitle}>状态画板</h1>
            <p className={page.pageSubtitle}>
              空状态、保存状态、操作反馈与删除确认。这些状态和主界面共用同一套组件与视觉令牌。
            </p>
          </div>
          <div className={page.pageActions}>
            <Link to={ROUTES.designSystem}>
              <Button variant="secondary">返回设计规范</Button>
            </Link>
          </div>
        </header>

        <section className={styles.group}>
          <div className={styles.groupHead}>
            <h2 className={styles.groupTitle}>空状态</h2>
            <span className={styles.groupNote}>每个空状态都必须说明「为什么空」和「下一步做什么」</span>
          </div>
          <div className={styles.twoColumn}>
            <div className={styles.statePanel}>
              <SectionTitle>新用户 · 还没有课程或笔记</SectionTitle>
              <EmptyState
                icon={BookPlus}
                compact
                title="欢迎使用码迹"
                description="先创建一门课程（例如「Python 入门」），再往里记录笔记。所有内容都保存在你自己的电脑上。"
                actions={
                  <>
                    <Button variant="primary" size="sm" onClick={() => toast.show('示例：创建课程')}>
                      创建第一门课程
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => toast.show('示例：写笔记')}>
                      直接写一篇笔记
                    </Button>
                  </>
                }
              />
            </div>

            <div className={styles.statePanel}>
              <SectionTitle>课程下游 · 没有笔记</SectionTitle>
              <EmptyState
                icon={FileText}
                compact
                title="这门课程还没有笔记"
                description="可以从课堂知识点、代码示例或报错记录开始记录。"
                actions={
                  <Button variant="primary" size="sm" onClick={() => toast.show('示例：新建笔记')}>
                    新建笔记
                  </Button>
                }
              />
            </div>

            <div className={styles.statePanel}>
              <SectionTitle>搜索 · 没有结果</SectionTitle>
              <EmptyState
                icon={Search}
                compact
                title="没有找到「装饰器」相关的内容"
                description="可以试试更短的关键词、去掉筛选条件，或换一个说法再搜一次。"
                actions={
                  <>
                    <Button variant="primary" size="sm" onClick={() => toast.show('示例：清空条件')}>
                      清空条件重新搜索
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => toast.show('示例：新建笔记')}>
                      新建一篇笔记
                    </Button>
                  </>
                }
              />
            </div>

            <div className={styles.statePanel}>
              <SectionTitle>复习 · 今天已清空</SectionTitle>
              <EmptyState
                icon={CircleCheck}
                compact
                title="今天没有待复习的内容"
                description="所有到期的知识点都复习完了，新的复习任务会在到期当天出现。"
                actions={
                  <Button variant="secondary" size="sm" icon={RotateCcw} onClick={() => toast.show('示例：查看即将到期')}>
                    看看即将到期的知识点
                  </Button>
                }
              />
            </div>

            <div className={styles.statePanel}>
              <SectionTitle>异常 · 笔记不存在</SectionTitle>
              <EmptyState
                icon={FileText}
                compact
                title="这篇笔记不存在或已被删除"
                description="它可能已经被移除。你可以回到学习首页，或从课程目录里选择另一篇笔记。"
                actions={
                  <Button variant="primary" size="sm" onClick={() => toast.show('示例：回到首页')}>
                    回到学习首页
                  </Button>
                }
              />
            </div>

            <div className={styles.statePanel}>
              <SectionTitle>筛选 · 条件过窄</SectionTitle>
              <EmptyState
                icon={Sparkles}
                compact
                title="这个筛选条件下没有笔记"
                description="换个课程、语言或关键词试试，也可以清空筛选查看全部笔记。"
                actions={
                  <Button variant="primary" size="sm" onClick={() => toast.show('示例：清空筛选')}>
                    清空筛选
                  </Button>
                }
              />
            </div>
          </div>
        </section>

        <section className={styles.group}>
          <div className={styles.groupHead}>
            <h2 className={styles.groupTitle}>保存状态</h2>
            <span className={styles.groupNote}>
              点击下面的按钮可以切换顶部栏的真实保存状态（当前：
              {saveState.status} · {formatSavedAt(saveState.savedAt)}）
            </span>
          </div>
          <div className={styles.statePanel}>
            <div className={styles.row}>
              {SAVE_STATES.map((item) => (
                <Button
                  key={item.status}
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    if (item.status === 'saved') {
                      setSaveState({ status: 'saved', savedAt: new Date().toISOString(), error: null });
                      return;
                    }
                    setSaveState({
                      status: item.status,
                      error: item.status === 'error' ? '本地数据库写入失败：磁盘空间不足' : null,
                    });
                  }}
                >
                  {item.label}
                </Button>
              ))}
              <Button variant="ghost" size="sm" onClick={() => setSaveState({ status: 'idle' })}>
                清除状态
              </Button>
            </div>
            <p className={`${styles.groupNote} ${styles.noteSpaced}`}>
              保存状态出现在顶部全局栏的右侧，四种状态分别是：有未保存的修改（黄）、正在保存（灰 + 转圈）、已保存（绿 + 对勾）、保存失败（红，可点击重试）。
            </p>
          </div>
        </section>

        <section className={styles.group}>
          <div className={styles.groupHead}>
            <h2 className={styles.groupTitle}>操作反馈</h2>
            <span className={styles.groupNote}>轻提示出现在底部居中，3 秒后自动消失，不打断输入</span>
          </div>
          <div className={styles.statePanel}>
            <div className={styles.row}>
              <Button
                variant="secondary"
                size="sm"
                icon={CircleCheck}
                onClick={() => toast.show({ message: '已保存到「Python 入门」', tone: 'success' })}
              >
                成功提示
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon={Info}
                onClick={() => toast.show({ message: '已复制代码', tone: 'info' })}
              >
                中性提示
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon={TriangleAlert}
                onClick={() =>
                  toast.show({ message: '「range 的右边界」将在 25 分钟后再出现', tone: 'warning' })
                }
              >
                提醒提示
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon={CircleAlert}
                onClick={() => toast.show({ message: '保存失败：本地数据库被占用', tone: 'error' })}
              >
                错误提示
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  toast.show({
                    message: '已删除「函数与参数」',
                    tone: 'info',
                    action: { label: '撤销', onClick: () => toast.show('已恢复笔记') },
                  })
                }
              >
                带撤销操作的提示
              </Button>
            </div>
          </div>
        </section>

        <section className={styles.group}>
          <div className={styles.groupHead}>
            <h2 className={styles.groupTitle}>删除确认</h2>
            <span className={styles.groupNote}>
              删除是不可逆操作，必须先确认；课程下还有笔记时给出明确原因
            </span>
          </div>
          <div className={styles.statePanel}>
            <div className={styles.row}>
              <Button variant="dangerGhost" size="sm" icon={Trash2} onClick={() => setConfirmNote(true)}>
                删除笔记（可删除）
              </Button>
              <Button variant="dangerGhost" size="sm" icon={Trash2} onClick={() => setConfirmCourse(true)}>
                删除课程（有笔记，拒绝）
              </Button>
            </div>
          </div>
        </section>

        <section className={styles.group}>
          <div className={styles.groupHead}>
            <h2 className={styles.groupTitle}>加载与进行中</h2>
            <span className={styles.groupNote}>读取本地数据用骨架屏，动作进行中用按钮内的转圈</span>
          </div>
          <div className={styles.twoColumn}>
            <div className={styles.statePanel}>
              <SectionTitle>骨架屏</SectionTitle>
              <div className={styles.skeletonStack}>
                {[72, 88, 46, 64].map((width) => (
                  <span className={styles.skeletonLine} key={width} style={{ width: `${width}%` }} />
                ))}
              </div>
            </div>
            <div className={styles.statePanel}>
              <SectionTitle>按钮与行内加载</SectionTitle>
              <div className={styles.row}>
                <Button
                  variant="primary"
                  size="sm"
                  loading={busy}
                  onClick={() => {
                    setBusy(true);
                    window.setTimeout(() => setBusy(false), 1600);
                  }}
                >
                  保存修改
                </Button>
                <span className={styles.row}>
                  <LoaderCircle size={14} className={styles.spinDemo} aria-hidden />
                  <span className={styles.groupNote}>正在读取课程…</span>
                </span>
              </div>
            </div>
          </div>
        </section>
      </div>

      <ConfirmDialog
        open={confirmNote}
        title="删除这篇笔记？"
        description="删除后无法恢复，关联的复习知识点会一并移除。"
        icon={Trash2}
        confirmLabel="删除笔记"
        details={
          <div className={styles.deleteSummary}>
            <strong className={styles.deleteSummaryName}>函数与参数</strong>
            <span className={styles.deleteSummaryMeta}>Python 入门 · 42 分钟前更新 · 3 个复习知识点</span>
          </div>
        }
        onCancel={() => setConfirmNote(false)}
        onConfirm={() => {
          setConfirmNote(false);
          toast.show({ message: '已删除「函数与参数」', tone: 'info' });
        }}
      />

      <ConfirmDialog
        open={confirmCourse}
        title="删除课程？"
        description="只有课程下没有笔记时才能删除，删除后课程无法恢复。"
        icon={Trash2}
        confirmLabel="删除课程"
        details={
          <div className={styles.deleteSummary}>
            <strong className={styles.deleteSummaryName}>Python 入门</strong>
            <span className={styles.deleteSummaryMeta}>当前有 6 篇笔记</span>
            <span className={`${styles.deleteSummaryMeta} ${styles.dangerNote}`}>
              该课程下还有 6 篇笔记，请先移动或删除笔记
            </span>
          </div>
        }
        onCancel={() => setConfirmCourse(false)}
        onConfirm={() => setConfirmCourse(false)}
      />
    </div>
  );
}
