# 码迹 · 编程学习笔记

**把课堂知识、代码练习和复习记录整理到自己的电脑上。**

码迹是一款面向编程学习者的 Windows 桌面笔记应用。你可以按课程记录知识点、保存代码片段、誊写老师发来的晨考题，并使用自己配置的 AI 服务辅助解释、续写、出题和生成思维导图。

普通笔记编辑与资料查看可以离线使用，桌面学习数据保存在本机 SQLite 数据库中。AI 功能由你主动触发，需要网络和服务商提供的 API 密钥。

[下载安装](https://github.com/zh2335897181-cell/maji/releases/latest) · [最新开发代码](https://github.com/zh2335897181-cell/maji/tree/ai-learning-assistant) · [问题反馈](https://github.com/zh2335897181-cell/maji/issues)

> 当前代码版本为 **0.5.6**，最新开发功能位于 `ai-learning-assistant` 分支。该分支已加入本地备份与恢复，尚未为这项功能发布新安装包。Releases 中的 0.5.6 安装包主要修复 AI 面板背景透明问题。下载版本的功能以对应发布说明为准。

## 目录

- [主要功能](#主要功能)
- [下载与安装](#下载与安装)
- [快速开始](#快速开始)
- [AI 服务配置](#ai-服务配置)
- [数据存储与备份](#数据存储与备份)
- [快捷键](#快捷键)
- [技术栈](#技术栈)
- [本地开发](#本地开发)
- [构建与发布](#构建与发布)
- [版本记录](#版本记录)
- [常见问题](#常见问题)
- [文档与反馈](#文档与反馈)

## 主要功能

| 模块 | 功能 |
| --- | --- |
| 学习首页 | 继续上次学习、最近笔记、今日待复习内容及快速新建入口 |
| 课程与笔记 | 按课程组织内容，通过标签、收藏及搜索定位知识点 |
| 富文本编辑器 | 标题、列表、任务列表、引用、链接、图片、表格、高亮、代码块和语义提示块 |
| 保存与阅读 | 自动保存、手动保存、编辑与阅读预览切换、笔记 Markdown 导出 |
| 代码记录 | 保存代码片段，提供代码高亮、语言选择和复制操作 |
| AI 学习助手 | 解释选中内容、结合整篇笔记理解知识、整理笔记和生成练习题；结果由用户选择使用 |
| AI 上下文续写 | 根据光标前后的内容建议后续文字，支持笔记正文及代码块 |
| 复习 | 知识点复习安排；从笔记生成概念题、简答与代码类题目，AI 评阅并给出解析 |
| 学习记录 | 保存复习范围、内容来源、答案、评阅结果、复习时间与深度 |
| 思维导图 | 从单篇或多篇笔记生成导图；编辑、搜索、缩放、折叠，导出 PNG、Markdown、JSON，导入 JSON |
| 晨考 | 按日期整理老师发来的题目和答案，支持新增、编辑、保存、搜索及阅读预览 |
| 数据与备份 | 开发分支支持全量导出、启动时自动备份、恢复预览、安全备份和事务恢复 |
| 应用设置 | 深浅色主题、正文字号、自动保存延迟、侧栏行为、AI 配置和桌面更新 |

晨考只用于誊写和保存内容，不包含考试、计时、自动批改或错题统计。AI 出题与评阅属于复习模块。

## 下载与安装

当前发布目标为 **Windows x64**，尚未提供 macOS、Linux 的正式安装包。

1. 打开 [GitHub Releases](https://github.com/zh2335897181-cell/maji/releases)。
2. 下载正式版本的 `maji-setup-版本号-x64.exe`，不要将源码压缩包当作安装包。
3. 运行安装程序，按提示选择安装目录，从桌面快捷方式启动「码迹」。

已安装用户可以通过「偏好设置 → 应用更新 → 检查更新」获取新版；发现可用更新后下载，由用户选择重启安装。也可以下载安装包覆盖安装。自己打出的包需要正确配置更新源。

当前发布流程未配置代码签名证书，Windows 可能显示发布者或 SmartScreen 提示。请核对安装包来自本仓库的正式发布页面。

## 快速开始

1. **建立课程**：按 Python、Java、Web 前端等方向创建课程。
2. **记录笔记**：每节课或每个知识点建立一篇笔记，用标题、列表和代码块整理内容。
3. **标记重点**：用标签、收藏、高亮和提示块记录容易混淆的地方。
4. **安排复习**：查看知识点安排；配置 AI 后，可以从笔记生成题目并保存答题记录。
5. **整理晨考**：填写日期、标题，把题目和答案写进正文。
6. **梳理结构**：选择来源笔记生成思维导图，检查结果后保存或导出。
7. **保存备份**：使用包含备份功能的开发版本时，定期导出一份到其他磁盘。

新资料库可能包含示例课程和笔记，便于熟悉操作。浏览器演示资料与桌面资料相互独立。

## AI 服务配置

在「偏好设置 → AI 服务」填写以下内容：

| 配置项 | 说明 |
| --- | --- |
| 接口地址 | 服务商提供的 OpenAI 兼容接口基础地址，按服务商说明填写；通常包含 `/v1`，不是完整聊天请求路径 |
| 模型名称 | 服务商实际提供的模型标识，不能随意填写显示名称 |
| API 密钥 | 在服务商控制台创建的密钥，不需要写入源码 |

保存后用界面的连接测试确认配置可用，再执行解释、续写、出题或导图生成。应用支持 OpenAI 兼容服务，可按服务商配置接入 DeepSeek 等模型；不同服务商的模型、参数和额度可能不同。

- 密钥使用 Electron `safeStorage` 在本机保存，不随学习数据备份导出。
- 使用 AI 时，所需的笔记内容会发送到你配置的服务商；留意来源范围和发送确认。
- 服务可能收费，费用、配额及可用性由服务商决定，应用不提供模型额度。
- AI 结果可能有误，代码、概念解释和评分应结合课堂资料检查。
- 没有配置 AI 也可以编辑笔记、保存代码、整理晨考，已有资料可以离线查看。

## 数据存储与备份

### 存储环境

桌面版学习资料保存在 Electron 用户数据目录下的 `maji.db` 中，AI 配置另行保存。安装目录与用户数据目录不是同一个位置。

浏览器开发模式使用浏览器本地存储供演示和测试，不会自动同步到桌面 SQLite，也不提供桌面全量备份功能。当前没有账号、云同步或多设备自动同步。

### 导出与自动备份

最新开发分支提供「偏好设置 → 数据与备份」：

- **导出备份**：先保存待保存的编辑内容，再选择 JSON 文件位置。
- **自动备份**：默认开启，启动时按本机日期每天最多创建一份，学习内容未变化时跳过。
- **备份目录**：自动文件位于 `userData/backups`，可从设置页直接打开。
- **保留策略**：自动备份与恢复前安全备份各保留最近 7 份，手动导出文件不参与自动清理。

备份覆盖课程、笔记、代码片段、练习、复习安排与答题记录、思维导图及视图、晨考。正文内嵌图片随内容保留，外部图片仅保留链接，不下载图片。

备份不包含 API 密钥、设备设置、缓存和日志。文件没有加密，可能包含个人学习内容。本机自动备份与原数据库通常位于同一磁盘，建议将手动备份另存到其他磁盘。

### 恢复步骤

1. 点击「从文件恢复」，选择备份文件。
2. 查看创建时间、来源版本和各类内容数量。
3. 确认**整体替换当前学习数据**，不是合并导入。
4. 应用先写入当前数据的安全备份，再通过 SQLite 事务执行恢复，成功后重新加载。

校验失败、安全备份写入失败或数据库导入失败时，当前学习数据保留。恢复不覆盖设备设置与 AI 密钥。预览后数据发生变化或确认超时，需要重新预览。

首版格式为 `maji-backup`，格式版本 1，仅接受数据库结构版本 6，文件上限 100 MiB。SHA-256 校验用于检测损坏，不代表来源认证。详细说明见 [本地备份与恢复](https://github.com/zh2335897181-cell/maji/blob/ai-learning-assistant/docs/backup-restore.md)。

## 快捷键

快捷键与页面和焦点有关，编辑正文时，格式快捷键优先作用于编辑器。

| 快捷键 | 操作 |
| --- | --- |
| `Ctrl + K` | 打开搜索 |
| `Ctrl + N` | 新建笔记；晨考页新建晨考 |
| `Ctrl + S` | 保存当前内容 |
| `Ctrl + P` | 切换编辑与阅读预览 |
| `Ctrl + B` | 编辑器内加粗；非编辑器场景收起或展开导航 |
| `Ctrl + /` | 打开快捷键帮助 |
| `Ctrl + Z` / `Ctrl + Shift + Z` | 撤销 / 重做 |
| `Ctrl + I` | 斜体 |
| `Ctrl + Shift + S` | 删除线 |
| `Ctrl + E` | 行内代码 |
| `Ctrl + Shift + 1 / 2 / 3` | 一级 / 二级 / 三级标题 |
| `Ctrl + Alt + C` | 插入代码块 |
| `Ctrl + Alt + T` | 插入 3×3 表格 |
| `Ctrl + Shift + H` | 高亮重点 |
| `Ctrl + Shift + Space` | 生成 AI 续写建议 |
| `Tab` | 在有续写建议时接受建议 |
| `Esc` | 忽略续写建议，或关闭浮层、对话框 |

更多操作说明可在工具栏提示和应用内快捷键帮助中查看。

## 技术栈

| 用途 | 技术 |
| --- | --- |
| 桌面应用 | Electron、electron-builder、electron-updater |
| 界面与路由 | React 19、TypeScript、React Router |
| 构建 | Vite、TypeScript 编译器 |
| 样式与图标 | CSS Modules、CSS 变量、Lucide |
| 富文本与文档 | TipTap 3、ProseMirror |
| 代码高亮 | Shiki |
| 数据库 | SQLite、better-sqlite3 |
| 测试 | Vitest、Testing Library、Playwright |
| 发布 | GitHub Actions、GitHub Releases、Windows NSIS 安装包 |

渲染进程通过 preload 提供的白名单 API 调用主进程，由主进程处理数据库、文件对话框、AI 请求及更新。编辑器与备份校验共享文档结构，恢复时检查正文、表关联和字段格式。

## 本地开发

需要 Git、Node.js 和 npm。当前 Windows 发布工作流使用 Node.js 22；依赖实际版本以 `package-lock.json` 为准。

### 获取最新开发代码

```powershell
git clone --branch ai-learning-assistant https://github.com/zh2335897181-cell/maji.git
cd maji
npm ci
```

### 启动桌面开发模式

```powershell
npm run dev:electron
```

该命令同时启动 Vite 和 Electron，前端地址为 `http://127.0.0.1:5199`。端口固定，启动前确认没有被占用。

只调试浏览器界面：

```powershell
npm run dev
```

如果 SQLite 原生模块提示 ABI 不匹配或加载失败，可以尝试：

```powershell
npm run rebuild:native
```

### 验证与测试

```powershell
npm run typecheck
npm test
npx playwright install chromium
npm run test:e2e
npm run test:release-config
npm run build
```

Windows 下，构建后可运行备份的真实桌面验证：

```powershell
node scripts/native-backup-check.cjs
```

脚本使用独立临时用户目录，验证 Electron 桥接、SQLite 全量恢复、安全备份、重启保留及空数据恢复，不读取个人笔记库。

### 目录结构

```text
maji/
├─ src/
│  ├─ app/                 应用入口、路由与共享状态
│  ├─ components/          通用组件、布局与界面控件
│  ├─ features/            笔记、AI、复习、导图、晨考、设置
│  ├─ lib/                 类型、数据接口、文档模型与共享逻辑
│  └─ styles/              全局样式与设计变量
├─ electron/
│  ├─ main/                窗口、SQLite、AI、备份、更新与 IPC
│  └─ preload/             渲染进程白名单 API
├─ e2e/                    浏览器端到端测试
├─ scripts/                图标、发布配置与桌面验证脚本
├─ docs/                   架构、设计及功能文档
├─ .github/workflows/      Windows 发布流程
├─ electron-builder.config.cjs
└─ package.json
```

## 构建与发布

### 本地安装包

```powershell
npm run package
```

生成 Windows x64 安装包到 `release/`，不会自动发布。若希望本地包具有 GitHub 更新源，在打包前指定：

```powershell
$env:MAJI_GITHUB_REPOSITORY = 'zh2335897181-cell/maji'
npm run package
```

### GitHub 正式发布

推送代码与发布安装包是两件事。普通 `git push` 不触发版本发布；发布工作流由 `v*` 标签触发，并要求标签与 `package.json` 的版本一致。

发布时先提升 `package.json` 和锁文件版本，完成验证并提交。将代码推送后，为该提交创建对应的新标签并推送。GitHub Actions 使用 `GITHUB_TOKEN` 构建安装包，发布安装程序、`latest.yml` 和 blockmap 文件，供应用检查更新。

不要将 API 密钥、发布令牌、签名私钥或个人数据库提交到仓库。流程见 [自动更新说明](https://github.com/zh2335897181-cell/maji/blob/ai-learning-assistant/docs/updates.md)，工作流见 [Release Windows](https://github.com/zh2335897181-cell/maji/blob/ai-learning-assistant/.github/workflows/release-windows.yml)。

## 版本记录

日期根据现有发布记录及标签提交整理。部分历史标签目前没有对应的可用 Release；下表版本链接指向源码标签，下载安装包以 [Releases 页面](https://github.com/zh2335897181-cell/maji/releases) 为准。

| 版本 | 日期 | 更新记录 |
| --- | --- | --- |
| 开发分支，尚未随新安装包发布(本次暂时无功能更新，后续增添新功能时，会推送新版本) | 2026-10-11 | 新增本地备份与恢复：全量导出、每日启动备份、恢复预览、安全备份、失败回滚；严格校验编辑器文档并保存待写入的导图视图 |
| [0.5.6](https://github.com/zh2335897181-cell/maji/tree/v0.5.6) | 2026-10-10 | 修复 AI 操作栏和结果面板背景透明，深浅主题使用不透明背景 |
| [0.5.5](https://github.com/zh2335897181-cell/maji/tree/v0.5.5) | 2026-10-10 | 版本发布准备；相较 0.5.4，提交记录未列出新增功能，Release 未附详细说明 |
| [0.5.4](https://github.com/zh2335897181-cell/maji/tree/v0.5.4) | 2026-10-10 | 修复复习参考答案过长时不换行、导致页面横向溢出的问题 |
| [0.5.3](https://github.com/zh2335897181-cell/maji/tree/v0.5.3) | 2026-10-10 | 修复笔记列表菜单裁剪及浮层定位问题 |
| [0.5.2](https://github.com/zh2335897181-cell/maji/tree/v0.5.2) | 2026-10-09 | 修复生成思维导图后连续切换笔记可能出现的白屏 |
| [0.5.1](https://github.com/zh2335897181-cell/maji/tree/v0.5.1) | 2026-10-09 | 新增晨考模块；改进 DeepSeek V4 系列最终答案兼容及 AI 错误提示 |
| [0.5.0](https://github.com/zh2335897181-cell/maji/tree/v0.5.0) | 2026-10-08 | 新增 AI 思维导图、节点编辑、导入导出和分支复习题；包含上下文续写 |
| [0.4.0](https://github.com/zh2335897181-cell/maji/tree/v0.4.0) | 2026-09-29 | 根据代码记录：新增 AI 复习会话与课程学习轨迹 |
| [0.3.0](https://github.com/zh2335897181-cell/maji/tree/v0.3.0) | 2026-09-28 | 根据代码记录：增强表格、快捷键和代码块，加入 AI 助手及设置页滚动优化 |
| [0.2.1](https://github.com/zh2335897181-cell/maji/tree/v0.2.1) | 2026-09-28 | 历史版本，未附详细发布说明 |
| [0.2.0](https://github.com/zh2335897181-cell/maji/tree/v0.2.0) | 2026-09-28 | 历史版本，未附详细发布说明 |
| [0.1.1](https://github.com/zh2335897181-cell/maji/tree/v0.1.1) | 2026-09-28 | 历史版本，未附详细发布说明 |

0.5.0–0.5.3 的补充说明保存在 [版本文档目录](https://github.com/zh2335897181-cell/maji/tree/ai-learning-assistant/docs/releases)。

## 常见问题

**没有 API 密钥能使用吗？** 可以。笔记、代码记录、晨考和已有资料的查看编辑不依赖 AI。AI 生成及评阅需要配置服务。

**网页里的笔记为什么桌面版看不到？** 浏览器与桌面版使用不同存储环境，目前不会自动互相导入或同步。

**安装包提示没有配置 GitHub 更新源怎么办？** 构建时没有设置更新仓库。使用正式发布的安装包，或按上面的打包步骤配置更新源。

**推送代码后为什么应用没有更新？** 应用读取正式 Release 的安装包与更新元数据。推送分支只更新源码，还需要完成新版本构建和发布。

**AI 返回空内容、调用失败或生成较慢怎么办？** 检查基础地址、模型标识、密钥、网络和额度，并运行连接测试。部分模型只返回思考内容或输出被截断时会给出错误提示。反馈时提供模型名称及错误文字，不发送密钥。

**恢复文件为什么被拒绝？** 文件可能损坏、超限、数据库结构不兼容或含无效正文。当前资料会保留，请选择匹配版本生成的有效备份，不要手动修改文件绕过校验。

**如何反馈白屏、菜单遮挡或保存问题？** 提供应用版本、窗口大小、操作步骤和错误提示；截图中请遮住私人笔记及密钥。

## 文档与反馈

- [技术架构](https://github.com/zh2335897181-cell/maji/blob/ai-learning-assistant/docs/ARCHITECTURE.md)
- [界面设计](https://github.com/zh2335897181-cell/maji/blob/ai-learning-assistant/docs/DESIGN.md)
- [晨考内容整理](https://github.com/zh2335897181-cell/maji/blob/ai-learning-assistant/docs/morning-notes.md)
- [本地备份与恢复](https://github.com/zh2335897181-cell/maji/blob/ai-learning-assistant/docs/backup-restore.md)
- [桌面自动更新](https://github.com/zh2335897181-cell/maji/blob/ai-learning-assistant/docs/updates.md)
- [提交 Bug 或功能建议](https://github.com/zh2335897181-cell/maji/issues)

欢迎通过 Issue 描述问题，或提交说明清晰的 Pull Request。修改代码前请查看模块及文档，运行相关测试，避免提交构建输出、个人数据库和敏感配置。

许可证：仓库目前未提供 `LICENSE` 文件。
