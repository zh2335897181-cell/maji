# 本地备份与恢复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 提供完整学习数据备份、预览恢复、恢复前保护和每日自动备份。

**Architecture:** 主进程负责白名单数据导出、文件校验、文件管理和 SQLite 事务恢复；渲染进程负责保存协调及确认界面。恢复期间通过集中写入门禁阻止旧页面或异步请求写回，完成后清理学习草稿并刷新。

**Tech Stack:** TypeScript、React、Electron、better-sqlite3、Node fs/crypto、Vitest、Playwright；不新增依赖。

**Spec:** ../specs/2026-10-11-backup-restore-design.md

## Global Constraints

- 首版只支持桌面 SQLite，备份格式版本 1，数据库版本为当前 SCHEMA_VERSION；不推断旧版转换。
- 文件上限 100 MiB；自动与恢复前备份分别保留最近 7 份。
- 排除设置、API 密钥、日志和缓存；不下载外部图片。
- 用户确认整体替换；任何校验或安全备份失败时不得修改当前数据。
- 不改应用版本，不发布安装包；实现验收后再单独处理发布。

## Review Focus

- 最后一刻的正文修改必须先保存；保存失败不进入恢复。
- 预览后来源文件或当前数据变化不得绕过再次确认。
- 恢复期间异步 AI 和旧草稿不能把旧数据写回。
- 空备份是合法数据，刷新后不能重新播种示例。
- 磁盘写满和外键错误不得产生半文件或部分恢复。

## 文件与接口

- `src/lib/backup.ts`：共享预览、状态及 API 类型；BackupPreview 含 token、createdAt、appVersion、schemaVersion、各表 counts；BackupStatus 含 enabled、lastSuccessAt、directory、managedFiles。
- `electron/main/backup/format.ts`：格式版本、白名单和逐项验证；`encodeBackup(snapshot, metadata): string`、`decodeBackup(raw: string): BackupSnapshot`、`contentDigest(snapshot): string`。
- `electron/main/backup/service.ts`：`exportBackup(): Promise<{saved:boolean}>`、`previewRestore(): Promise<BackupPreview|null>`、`restore(token:string): Promise<void>`、`status(): BackupStatus`、`setEnabled(enabled:boolean):void`、`autoBackup(now:Date):Promise<void>`。
- `electron/main/backup/files.ts`：原子写入、受管理文件列表与保留规则；手动导出不参与清理。
- `electron/main/backup/writeGate.ts`：`withWrite<T>(operation:()=>T):T`、`beginRestore():()=>void`；恢复期间拒绝学习数据变更，恢复事务内部使用专用连接操作。
- `electron/main/ipc/backup.ts`、`electron/preload/index.ts`、`src/lib/ipc.ts`：暴露受限 API，路径和数据库不暴露给渲染进程。
- `src/features/settings/BackupSettings.tsx`：备份操作、状态及恢复确认界面。
- `src/lib/learningDrafts.ts`：清理明确列出的笔记、晨考、导图恢复键与复习预设，不清理隐私授权或设备偏好。

### Task 1: 格式与快照验证

- [ ] 在 `electron/main/backup/format.test.ts` 编写导出解码往返、字段白名单、空数据、重复 ID、错误枚举、无效关联、损坏校验和超限文件测试；先运行确认缺少实现失败。
- [ ] 实现 format.ts 与共享类型，使用规范化 JSON 和 SHA-256。10 张学习数据表完整保留；验证嵌套文档、导图、复习字段，拒绝额外字段、危险键及错误数据版本。
- [ ] 内容变化摘要排除 last_opened_at 与 mind_map_views，文件校验仍覆盖完整内容；测试纯浏览不触发新备份、正文变化触发。
- [ ] 运行 `npx vitest run electron/main/backup/format.test.ts`，全部通过后提交格式模块。

### Task 2: 文件管理、事务与写入门禁

- [ ] 在 `service.test.ts` 与 `files.test.ts` 编写真实临时 SQLite 全表往返及磁盘错误、事务错误回滚测试，先确认失败。
- [ ] 实现同一读取事务快照、原子文件写入、7 份保留；只处理受管理目录内本模块文件。自动备份按本机日历日与摘要跳过重复，成功后才更新状态；测试跨午夜、无变化、失败后重试。
- [ ] 实现一次性 5 分钟预览令牌，缓存已验证内容及当前数据摘要；确认时重新检查摘要，不读取用户任意路径参数。测试过期、复用、文件被换、预览后数据变化。
- [ ] 恢复先落安全备份，按外键顺序删除导入，单写事务并检查外键；完成记录初始化标记。修改 `db/seed.ts`、`db/connection.ts`，保证合法空恢复不重新播种。
- [ ] 接入所有学习写 IPC 与 AI 结果持久化路径的写入门禁；异步结果写入前重新检查。预览不阻止编辑，真正恢复独占。
- [ ] 运行对应测试，确认任意失败数据库内容摘要不变，然后提交服务模块。

### Task 3: 保存协调与桌面桥接

- [ ] 编写 IPC 取消、参数验证、重复恢复、未保存内容及迟到 AI 回写测试；先确认失败。
- [ ] 复用现有关闭前保存回调机制，为备份增加只保存不关闭的请求/回执协议；有任一保存失败则停止，超时 30 秒明确提示。
- [ ] previewRestore、exportBackup 和 restore 均先协调保存；restore 校验预览摘要时若因新输入变化失效要求重新预览。
- [ ] 恢复成功清理指定草稿键并重载，抑制旧页面 beforeunload 的学习写回；失败解除门禁并保留草稿。
- [ ] 在主进程启动完成迁移后、显示窗口前运行自动备份；失败向状态报告，不阻止启动。
- [ ] 运行主进程与 preload 测试后提交桥接模块。

### Task 4: 设置界面与端到端验收

- [ ] 编写 `BackupSettings.test.tsx`：保存对话框取消、显示数量与日期、确认替换、安全备份失败、恢复按钮防重复、浏览器桌面说明，先确认失败。
- [ ] 接入现有偏好设置，使用既有 Modal/Button 样式；提供自动备份开关、文件列表、打开目录、导出和恢复预览。文案说明备份不含密钥、同盘保护限制和外部图片限制。
- [ ] 在独立临时 userData 下执行真实 Electron 验收：创建全部学习数据、导出、修改、预览恢复、重启验证、空数据恢复、损坏拒绝及并发写入拒绝。不得操作用户真实数据库。
- [ ] 执行 `npm test`、`npm run build` 及相关 Playwright 流程；失败修复后再宣告完成。
- [ ] 更新 README 使用说明与 `docs/backup-restore.md`，明确格式兼容范围、默认目录和失败处理；本地提交实现，不自动发布。

## 自查

设计中的手动备份、预览、自动保留、失败回滚、密钥隔离、日界线、草稿清理和外部图片边界均有对应任务。发布操作不属于此计划。实现时如已有关闭回调协议无法安全复用，保持其原行为并添加独立备份协议，不改关闭语义。
