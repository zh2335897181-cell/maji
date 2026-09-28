# 码迹 Electron 自动更新设计

状态：已批准并进入本地实现（未推送 / 未发布）  
日期：2026-09-28

## 目标

为 Windows NSIS 安装版增加可用的自动更新：用户能在应用内查看更新状态、检查新版本、看到下载进度，并在下载完成后选择立即重启安装或稍后处理。更新过程由 Electron 主进程控制，界面只通过白名单 preload API 接收状态和发起操作。

## 当前约束

- 应用已使用 Electron 44、electron-builder 26 和 Windows NSIS 安装包。
- 用户数据保存在本机 SQLite 中；升级不得覆盖用户数据库。
- 应用已有 `TopBar` 的偏好设置对话框，可作为更新状态与操作入口。
- GitHub 公开仓库 `zh2335897181-cell/maji` 已由用户授权创建；远端目前为空，本地项目目录仍没有 Git 元数据或 remote。
- 当前已发布的 0.1.0 安装包没有更新器。用户需要先手动安装第一个带更新器的版本，之后才可自动升级。
- 当前没有 Windows 代码签名证书；可验证和分发 unsigned 安装包，但 Windows 可能显示来源确认提示。签名可作为后续发布增强。

## 方案

采用 `electron-updater` 配合 electron-builder 的 GitHub Releases provider。该方案适配当前 NSIS 安装目标；electron-updater 在主进程运行，并使用由 electron-builder 在安装包中生成的更新源配置及 `latest.yml` 元数据。公开 Releases 作为客户端下载源，发布凭据只在发布环境使用，绝不写入客户端。

### 应用启动与更新状态

打包后的 Windows 应用启动并完成首屏加载后，延迟数秒执行一次更新检查。开发模式、测试模式和非 Windows 平台不自动联网检查。更新器自动下载已发布的新版本；不弹强制模态框，所有状态在偏好设置里可查看，也通过应用现有 toast 通知“发现更新”“下载完成”或检查失败。

界面状态至少包括：当前版本、正在检查、已是最新、发现新版本、下载百分比、下载完成等待重启、检查/下载失败。用户可以再次手动检查；下载完成后可以点击“立即重启并安装”或关闭提示稍后处理。退出安装前仍走现有笔记保存握手。

### IPC 边界

- `window.maji.updates.check()`：请求主进程检查更新。
- `window.maji.updates.install()`：preload 先执行已注册的笔记保存回调，全部成功后才请求主进程在更新已下载后退出并安装。
- `window.maji.updates.getStatus()`：读取当前状态，供重新加载页面或稍后打开偏好设置时恢复显示。
- `window.maji.updates.onStatus(handler)`：订阅有限字段的更新状态并返回取消订阅函数。
- 不暴露 `ipcRenderer`、文件系统、token 或原始 `autoUpdater`。
- 主进程将 `checking-for-update`、`update-available`、`download-progress`、`update-downloaded`、`update-not-available`、`error` 转成应用自己的窄类型状态对象。

### 发布配置

- electron-builder 显式配置 GitHub provider 的 owner 和 repo；不得靠机器上偶然存在的 Git remote 推断更新目的地。
- 添加 tag 触发的 Windows 发布 workflow：安装依赖、运行 typecheck/tests、构建 NSIS、上传安装包及 `latest.yml` 到非 draft GitHub Release。
- 发布脚本显式请求发布；普通 `npm run package` 只本地构建，不发布。
- workflow 仅用 GitHub Actions 提供的仓库 token 上传 release，不在应用、源码或客户端配置里放 token。
- 版本号必须递增；发布说明包含用户可读变更摘要。

更新设置作为独立的 `UpdateSettings` 组件嵌入现有偏好设置；常驻 TopBar 负责订阅状态和 toast，避免打开设置晚于启动检查后丢失状态。

## 错误处理与安全

- 网络离线、GitHub 限流或更新源不可用时保留当前版本，展示简洁失败状态，允许用户稍后重试。
- 更新只从显式配置的 HTTPS GitHub Release feed 获取；不允许渲染进程提供更新 URL。
- 自动下载后不立即退出应用；只有用户触发安装操作后才 `quitAndInstall`。
- 通过设置页安装更新前，preload 先等待所有已注册的草稿保存处理器成功；保存失败时不调用安装接口。
- 更新下载不改变 SQLite schema 的迁移策略；数据库升级仍由新版本启动时现有迁移机制处理。
- 若安装包启用代码签名，发布使用稳定证书，并保持不同版本签名身份一致；证书配置留在 CI secret。

## 验收标准

1. `npm run package` 仍只构建本地安装包，不上传发布。
2. 开发模式不请求 GitHub 更新源，且更新 UI 可说明仅安装版支持更新。
3. 渲染进程只能调用检查、安装和状态订阅三项白名单 API。
4. 主进程事件正确覆盖无更新、可用、下载进度、下载完成和失败状态。
5. 版本更新完成后用户确认重启才安装；稍后选择不会丢失笔记或关闭现有窗口。
6. 标签发布 workflow 能创建包含 NSIS 安装程序和更新元数据的 GitHub Release。
7. 在配置仓库 owner/repo 后，安装版能读取该公开 Releases feed；用户数据仍保存在本机。

## 待确认项

已确认的更新目的地为 `zh2335897181-cell/maji`。启用在线更新前，需要把本地项目接入该仓库并发布首个带更新器的版本。

## 自检

- 未把开发构建的更新检查误当作生产功能。
- 普通打包脚本没有隐式发布行为。
- 客户端不包含发布 token。
- 旧版用户需要手动安装首个带更新支持的安装包。
- 本地类型检查、单元测试、本地 Windows NSIS 打包和冒烟链路已完成；GitHub Actions 发布与实际在线更新仍需代码进入仓库并发布首个带更新器的版本后验证。
