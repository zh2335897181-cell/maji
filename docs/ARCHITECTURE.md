# 码迹 · 技术架构

> Electron + React 19 + TypeScript + Vite 的桌面笔记应用。本文说明进程分工、
> 数据流、关键数据结构和安全边界，并给出可执行的命令清单。

---

## 1. 技术栈与选型理由

| 层 | 选型 | 说明 |
| --- | --- | --- |
| 桌面容器 | Electron 44 | 主进程负责窗口、数据库、文件导出；渲染进程只跑界面 |
| 前端框架 | React 19 + TypeScript 严格模式 | 函数组件 + Hooks，无类组件 |
| 构建 | Vite 8 | 渲染进程用 Vite；主进程/preload 用 `tsc` 编译成 CommonJS |
| 样式 | CSS Modules + CSS 变量 | 不引入 UI 框架，设计令牌集中在 `src/styles/tokens.css` |
| 图标 | lucide-react | 线性图标，白名单见 `src/lib/icons.ts` |
| 编辑器 | TipTap 3 | 标题、列表、引用、代码块、待办、图片、链接；自定义 `callout` 节点 |
| 代码高亮 | Shiki 4 | 只加载 7 种语言 + 2 套主题，`structure: 'inline'` 便于自绘容器 |
| 本地存储 | better-sqlite3 13（SQLite） | 仅主进程使用，Node-API 预编译产物，**无需为 Electron 重新编译** |
| 路由 | React Router 7（HashRouter） | 打包后由 `file://` 直接打开也能工作 |
| 状态管理 | React Context + `useState`/`useReducer` | 只有跨页面数据进 Context；未引入 Zustand |
| 测试 | Vitest + Playwright | 纯逻辑与数据操作用 Vitest；关键界面流程用 Playwright |

**为什么不用 Zustand**：全局共享状态只有一份「资料库快照」（课程/笔记索引/标签/复习/练习/设置），
用一个 Context + 若干 `useCallback` 操作即可，编辑器草稿等易变状态留在组件内部，
引入外部状态库反而会增加同步负担。

---

## 2. 进程分工与数据流

```
┌──────────────────────── 渲染进程（sandbox: true, contextIsolation: true）───────────────────────┐
│  React 界面                                                                                     │
│    ├── src/app/LibraryProvider.tsx   课程/笔记索引/标签/复习/练习/设置 + 保存状态                │
│    ├── src/lib/dataSource.ts         数据源选择：有 window.maji → IPC；否则 → 本地示例仓库        │
│    └── src/lib/repository.ts         MajiRepository 接口（界面只依赖它）                          │
│              │                                                                                  │
│              │  window.maji（preload 注入，仅白名单方法）                                        │
└──────────────┼──────────────────────────────────────────────────────────────────────────────────┘
               │  contextBridge
┌──────────────┼──────────────────────── 预加载脚本 electron/preload/index.ts ────────────────────┐
│              │  逐通道包装 ipcRenderer.invoke，不暴露 ipcRenderer 本身，不接受通道名参数          │
└──────────────┼──────────────────────────────────────────────────────────────────────────────────┘
               │  ipcMain.handle（每个通道都先校验参数）
┌──────────────┼──────────────────────── 主进程 electron/main ────────────────────────────────────┐
│  ipc/handlers.ts → ipc/validate.ts → db/{courses,notes,library}.ts → db/connection.ts (SQLite)   │
│  文件导出走 dialog.showSaveDialog（渲染进程只能给文件名，不能给路径）                              │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

**关键点**：界面永远只依赖 `MajiRepository` 接口，因此同一套界面可以在三种环境运行：

| 运行方式 | 数据源 | 用途 |
| --- | --- | --- |
| `npm run dev:electron` | SQLite（主进程） | 真实使用 |
| `npm run dev` | `localStorage` 示例数据 | 纯前端开发、调试样式 |
| `npm run test:e2e` | `localStorage` 示例数据 | 端到端测试（每个用例全新上下文，数据自动重新播种） |

两个实现共用同一批纯函数（`src/lib/search.ts`、`src/lib/review.ts`、`src/lib/noteDoc.ts`、
`src/lib/text.ts`），因此「同一个关键词在两种数据源下得到同一批结果」。
主进程侧做过 76 项逐条对拍（列表/筛选/排序、搜索的 noteId 顺序与命中字段、复习三动作、
删除级联与拒绝文案），结果完全一致。

---

## 3. 目录结构

```
maji/
├── electron/                       # 主进程与预加载（不参与 Vite 打包）
│   ├── main/
│   │   ├── index.ts                # 生命周期、安全策略、致命错误出口
│   │   ├── window.ts               # 窗口创建（1440×900，最小 1024×700）
│   │   ├── smoke.ts                # MAJI_SMOKE_TEST 冒烟钩子
│   │   ├── db/connection.ts        # 连接、WAL、外键、迁移与首次播种
│   │   ├── db/schema.ts            # 建表 SQL + PRAGMA user_version 迁移
│   │   ├── db/seed.ts              # 空库时写入示例数据（单事务）
│   │   ├── db/mappers.ts           # 行 ↔ 领域对象、枚举白名单
│   │   ├── db/courses.ts           # 课程读写
│   │   ├── db/notes.ts             # 笔记读写 + 搜索
│   │   ├── db/library.ts           # 片段 / 练习 / 复习 / 标签 / 设置
│   │   └── ipc/{handlers,validate}.ts
│   └── preload/index.ts
├── src/
│   ├── app/                        # 路由、布局、全局 Provider
│   │   ├── App.tsx  AppLayout.tsx  routes.ts
│   │   ├── LibraryProvider.tsx     # 跨页面数据与保存状态
│   │   └── ToastProvider.tsx
│   ├── components/
│   │   ├── ui/                     # Button / Fields / Tag / Modal / Menu / EmptyState + 3 个 css module
│   │   └── layout/                 # AppSidebar / CourseTree / TopBar / SaveStatus / SearchOverlay
│   ├── features/
│   │   ├── home/                   # 学习首页、404
│   │   ├── notes/                  # 编辑页、工具栏、草稿状态机、大纲、辅助栏、导出
│   │   │   └── editor/             # TipTap 扩展、代码块视图、语义块视图、正文样式
│   │   ├── courses/                # 课程与笔记管理、课程编辑弹窗
│   │   ├── search/  review/  create/
│   │   └── design/                 # 设计规范画板、状态画板
│   ├── lib/                        # 类型、数据访问、纯逻辑工具
│   ├── styles/                     # tokens.css（设计令牌）、base.css
│   └── test/setup.ts
├── e2e/flows.spec.ts               # 20 个关键流程用例 × 2 种窗口尺寸
├── scripts/capture-design.mjs      # 导出 design/ 下的设计稿
├── design/                         # 24 张设计交付图（1440×900 / 1280×800）
└── docs/{DESIGN.md,ARCHITECTURE.md}
```

---

## 4. 数据结构

渲染进程与主进程共用 `src/lib/types.ts`。SQLite 表名用 snake_case，字段一一对应。

```ts
Course      { id, name, description, language, colorKey, iconKey, sortOrder, createdAt, updatedAt }
Note        { id, courseId, title, contentJson, contentText, codeText*, excerpt, language,
              tags[], favorite, archived, createdAt, updatedAt, lastOpenedAt }
NoteSummary = Omit<Note, 'contentJson' | 'contentText'> & { courseName, courseColorKey }
CodeSnippet { id, title, language, code, description, output, courseId, noteId, createdAt, updatedAt }
ReviewItem  { id, title, summary, noteId, courseId, state, dueAt, lastReviewedAt,
              reviewCount, confidence, createdAt, updatedAt }
Exercise    { id, title, prompt, hint, solution, language, difficulty, done,
              courseId, noteId, createdAt, updatedAt }
Tag         { name, noteCount }
UserSettings{ theme, editorFontSize, editorFontFamily, autoSaveDelayMs, sidebarCollapsed,
              asideCollapsed, lastOpenedNoteId, recentNoteIds[] }
```

\* `codeText` 是 SQLite 侧的派生列（从 `contentJson` 抽取代码块），仅用于搜索粗筛，界面不使用。

**关系与级联**

```
Course 1──n Note 1──n ReviewItem        （删除笔记 → 级联删除其复习知识点）
                └──n Exercise           （删除笔记 → exercises.note_id 置空）
                └──n CodeSnippet        （删除笔记 → snippets.note_id 置空）
Course 1──n Note                        （课程下还有笔记时拒绝删除课程）
```

**笔记正文格式**：TipTap 文档 JSON，存 `content_json`。同时派生：

- `content_text`：纯文本（含代码），用于搜索与摘要；
- `code_text`：仅代码块，用于「搜索代码」；
- `excerpt`：**第一段正文**（跳过标题与代码块），用于列表与卡片摘要。

三个派生字段由 `docToPlainText` / `extractCodeText` / `noteExcerpt` 计算，
浏览器实现与主进程实现调用同一份函数，保证一致。

**自定义节点**：`codeBlock`（带 `language` 属性）、`callout`（`variant`: note / tip / warning / output）。
两者都能被 `buildOutline` 识别，从而出现在右侧大纲里并可点击跳转。

---

## 5. 保存与并发

```
用户输入 ──▶ useNoteDraft.handleEditorChange
              │  合并 patch（contentJson / contentText）
              ▼
        saveState = 'dirty'  ──(停止输入 autoSaveDelayMs，默认 700ms)──▶ 'saving' ──▶ 'saved'
              │                                                              │
              └── Ctrl+S / 切换笔记 / 关闭窗口 ────────────────────────────────┘
                                                 失败时保留 patch，状态置 'error' 可点击重试
```

- 保存状态由顶栏统一呈现，编辑页不需要自己画状态。
- 切换笔记时先落盘上一篇（`flush()`），再读取新的一篇，避免丢改动。
- 收藏、标签是离散操作，立即保存；正文是连续输入，按延迟合并保存。

---

## 6. 安全边界

| 要求 | 实现 |
| --- | --- |
| `contextIsolation` | `true` |
| `nodeIntegration` | `false` |
| 渲染进程访问 Node / 文件系统 / SQLite | 全部禁止；`sandbox: true`，preload 只 `require('electron')` |
| preload API 范围 | 只暴露 `window.maji` 上的固定方法，不接受通道名参数，不暴露 `ipcRenderer` |
| IPC 参数校验 | `electron/main/ipc/validate.ts` 逐通道校验：id 正则、字符串长度上限、枚举白名单、数组长度上限，全部抛中文错误 |
| 任意文件读写 | 不存在。导出只能通过 `dialog.showSaveDialog`，文件名经 `toSafeFileName`（去掉路径分隔符与 `..`） |
| 外部链接 | 仅允许 `https:` / `http:`，其余协议（`file:` / `javascript:` / `data:` / 自定义）拒绝 |
| 新窗口 / 导航 | `setWindowOpenHandler` 一律 deny；`will-navigate` 只允许应用自身来源 |
| 权限请求 | `setPermissionRequestHandler` 全部拒绝 |
| CSP | `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:` —— 不用内联脚本（主题在 `main.tsx` 顶部应用） |
| 注入防护 | 搜索高亮用结构化分段渲染，Shiki 输出经过转义，不拼接用户 HTML |

---

## 7. 命令清单

```bash
# 依赖
npm install

# 开发
npm run dev                 # 仅渲染进程（浏览器打开 http://127.0.0.1:5199，使用 localStorage 示例数据）
npm run dev:electron        # Vite + Electron（主进程 SQLite，真实使用形态）

# 质量
npm run typecheck           # 渲染进程 + 主进程两套 tsconfig，严格模式
npm test                    # Vitest：69 个用例（纯逻辑 + 数据操作）
npm run test:e2e            # Playwright：20 个流程 × 1440×900 / 1280×800
npm run test:e2e -- --project=desktop-1440x900

# 构建与打包
npm run build               # typecheck + 编译主进程 + 构建渲染进程
npm start                   # 用已构建产物启动 Electron
npm run package             # electron-builder 打包 Windows x64（NSIS 安装包）

# 设计稿
node scripts/capture-design.mjs   # 需要先 npm run dev，输出到 design/
```

**原生模块说明**：`better-sqlite3@13` 提供 Node-API 预编译产物，与 ABI 无关，
在 Electron 44 中可直接使用，**不需要 `electron-rebuild`**。`npm run rebuild:native`
脚本保留给需要从源码编译的特殊情况（需要 Visual Studio Build Tools）。

**冒烟测试**（无需人工操作键盘）：

```bash
$env:MAJI_SMOKE_TEST=1; npx electron .
# → [maji] smoke ok，退出码 0
```

---

## 8. 测试策略

| 层次 | 工具 | 覆盖内容 |
| --- | --- | --- |
| 纯逻辑 | Vitest | 时间与到期文案、复习排期三步动作、搜索打分与筛选、Markdown 导出、大纲位置、文本工具 |
| 数据操作 | Vitest | `LocalRepository` 的课程/笔记/片段/练习/复习/设置全量行为，含删除级联与拒绝文案 |
| 编辑器一致性 | Vitest | 用真实 ProseMirror schema 交叉验证 `buildOutline` 的位置推算 |
| 界面流程 | Playwright | 首页继续学习、三栏结构、代码复制、大纲跳转、收藏、保存状态、预览、删除确认、搜索浮层与搜索页、课程管理重命名/删除、复习三动作、新建流程与表单校验、响应式折叠 |

Playwright 使用本机 Chrome（`channel: 'chrome'`），无需额外下载浏览器内核；
`webServer` 配置会自动复用已在运行的 dev server。
