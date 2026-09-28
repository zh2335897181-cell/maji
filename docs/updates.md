# 桌面应用自动更新

码迹通过 GitHub Releases 为 Windows x64 NSIS 安装包提供更新。首次使用需要从 GitHub Releases 手动下载安装包；此后应用会在启动后检查更新，发现新版后自动下载，并由用户选择何时重启安装。

## 发布新版本

1. 在 `package.json` 中提升 `version`，例如 `0.2.0`。
2. 将代码推送到 `zh2335897181-cell/maji`，并推送与版本完全匹配的标签 `v0.2.0`。
3. GitHub Actions 的 `Release Windows` 工作流会运行类型检查和测试，构建 Windows 安装包，并创建可供自动更新读取的正式（非草稿）GitHub Release。发布资产包括安装程序、`latest.yml` 和 blockmap 文件。
4. 在 GitHub Release 页面补充面向用户的更新说明。首次发布建议同时说明主要功能和升级注意事项。

发布工作流仅由 `v*` 标签触发，并校验标签与 `package.json` 版本一致。令牌只由 GitHub Actions 的 `GITHUB_TOKEN` 提供，不放入应用代码或安装包。不要把 Release 标记为 Draft；草稿不会向自动更新客户端提供可见的版本信息。

## 本地打包

`npm run package` 只在本机生成安装包，不会发布。未设置更新仓库时，包内更新源标记为空，设置页会说明该安装包未配置自动更新源。只有 `npm run package:release` 配合受信任的 Actions 环境与发布令牌才会尝试发布。

## 签名

当前构建不配置代码签名证书，Windows 可能显示 SmartScreen 提示。代码签名可提升发布者识别与安装信任度，但证书与签名流程应在后续单独配置；签名不是 `electron-updater` 的传输令牌，也不要把私钥提交到仓库。
