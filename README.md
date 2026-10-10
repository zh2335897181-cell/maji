# 码迹 · 编程学习笔记

码迹是一款面向编程学习者的 Windows 桌面笔记应用。你可以按课程整理知识点、保存代码片段、记录老师发来的晨考内容，并通过 AI 辅助理解、续写、复习和生成思维导图。

笔记等学习数据保存在本机，日常记录无需连接 AI 服务。当前版本：**0.5.3**。

## 下载与安装

从 [最新发布页面](https://github.com/zh2335897181-cell/maji/releases/latest) 下载 Windows x64 安装包 `maji-setup-版本号-x64.exe`，运行后选择安装目录即可。

已安装用户可以在应用设置中点击「检查更新」，也可以下载新安装包覆盖安装。更新时保留原有应用数据；卸载时如果希望保留笔记，请不要删除应用数据。

## 主要功能

| 模块 | 功能介绍 |
| --- | --- |
| 学习首页 | 继续上次学习、查看最近笔记和待复习内容，快速新建内容 |
| 课程与笔记 | 按课程组织笔记，结合标签、收藏和搜索查找知识点 |
| 笔记编辑器 | 标题、列表、任务列表、引用、链接、图片、表格和代码块；支持自动保存、手动保存及阅读预览 |
| AI 学习助手 | 结合笔记内容辅助解释知识和代码，提供上下文续写，方便编写正文与代码块 |
| 复习 | 根据已有笔记生成题目，包含代码题；提交后由 AI 评阅并给出解析，记录复习时间、内容与深度 |
| 思维导图 | 从单篇或多篇笔记生成导图，编辑、搜索、缩放与折叠节点；支持导出 PNG、Markdown、JSON，以及导入 JSON 备份 |
| 晨考 | 手动誊写老师的概念题和答案，按日期倒序整理，支持搜索、新增、编辑、保存和阅读预览 |
| 桌面设置 | 深浅色主题、编辑器字号、保存延迟、侧栏设置和应用更新 |

晨考是内容记录模块，不包含考试、计时、自动批改或错题统计。

## 使用 AI

在应用设置的「AI 服务」中填写服务商提供的接口地址、模型名称和 API 密钥。应用支持 OpenAI 兼容接口，可配置 DeepSeek 等服务；模型名称请使用服务商实际提供的标识。

密钥通过桌面系统安全存储保存在本机。执行 AI 功能时，相关笔记内容会发送到你配置的服务；是否收费、可用模型与额度由该服务商决定。选择发送整篇笔记或生成思维导图时，请留意应用中的来源确认提示。已有笔记和导图可以离线查看、编辑。

## 常用快捷键

| 快捷键 | 用途 |
| --- | --- |
| `Ctrl + K` | 打开搜索 |
| `Ctrl + N` | 新建笔记；在晨考页面新建晨考记录 |
| `Ctrl + S` | 手动保存当前内容 |
| `Ctrl + P` | 切换编辑与阅读预览 |
| `Ctrl + /` | 在笔记编辑器查看快捷键帮助 |
| `Ctrl + Alt + T` | 在笔记编辑器插入表格 |
| `Ctrl + Alt + C` | 在笔记编辑器插入代码块 |
| `Ctrl + Shift + Space` | 在笔记编辑器触发 AI 续写 |

更多格式快捷键可在编辑器工具栏及快捷键帮助中查看。

## 版本发布记录

以下日期为 GitHub 发布日期，同一标签的重复发布记录合并展示。

| 版本 | 发布日期 | 更新内容 |
| --- | --- | --- |
| [0.5.1](https://github.com/zh2335897181-cell/maji/releases/tag/v0.5.1) | 2026-10-09 | 新增晨考模块；修复 DeepSeek V4 系列的 AI 最终答案兼容问题；优化截断、空响应等错误提示。[详细说明](docs/releases/0.5.1.md) |
| [0.5.0](https://github.com/zh2335897181-cell/maji/releases/tag/v0.5.0) | 2026-10-08 | 新增 AI 思维导图、节点编辑、导入导出与分支复习题；包含上下文 AI 续写。[详细说明](docs/releases/0.5.0.md) |
| [0.4.0](https://github.com/zh2335897181-cell/maji/releases/tag/v0.4.0) | 2026-09-29 | 根据代码提交记录：新增 AI 复习会话与课程学习轨迹。 |
| [0.3.0](https://github.com/zh2335897181-cell/maji/releases/tag/v0.3.0) | 2026-09-28 | 根据代码提交记录：增强编辑器表格、快捷键和代码块，加入 AI 学习助手及设置页滚动优化。 |
| [0.2.1](https://github.com/zh2335897181-cell/maji/releases/tag/v0.2.1) | 2026-09-28 | 历史版本，未附详细发布说明。 |
| [0.2.0](https://github.com/zh2335897181-cell/maji/releases/tag/v0.2.0) | 2026-09-28 | 历史版本，未附详细发布说明。 |
| [0.1.1](https://github.com/zh2335897181-cell/maji/releases/tag/v0.1.1) | 2026-09-28 | 历史版本，未附详细发布说明。 |

全部安装包与发布记录见 [GitHub Releases](https://github.com/zh2335897181-cell/maji/releases)。

## 本地开发

项目采用 React、TypeScript、Vite、Electron、TipTap 和 SQLite。发布工作流使用 Node.js 22，建议开发环境保持一致。

```bash
npm ci
npm run rebuild:native
npm run dev:electron
```

仅启动浏览器前端可以使用 `npm run dev`；浏览器演示与桌面数据库的存储环境不同。

常用验证与构建命令：

```bash
npm run typecheck
npm test
npm run test:e2e
npm run build
npm run package
```

`npm run package` 构建 Windows x64 安装包，输出到 `release/`。推送与 `package.json` 版本一致的 `v*` 标签后，GitHub Actions 会验证代码并构建发布安装包及自动更新文件。发布配置见 [自动更新说明](docs/updates.md)。

## 项目文档与反馈

- [架构说明](docs/ARCHITECTURE.md)
- [界面设计说明](docs/DESIGN.md)
- [晨考模块说明](docs/morning-notes.md)
- [提交问题或建议](https://github.com/zh2335897181-cell/maji/issues)

反馈问题时请附上应用版本、操作步骤和错误提示，避免提交 API 密钥或私人笔记内容。
