# Assistant Import Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for inline execution.

**Goal:** 有明确格式、权限与操作边界的2D/3D角色导入。
**Architecture:** 主进程内存快照与授权校验，隔离预览，确认后保存副本；React 四步向导。
**Tech Stack:** Electron, React, Three.js/three-vrm, DOM image/layer renderer.
**Spec:** ../specs/2026-11-13-assistant-import-design.md

## Global Constraints

不自动认证许可；无权限声明不能提交；禁止外部资产与可执行脚本；取消不切换；模型不发送AI。

## Review Focus

绕过授权直接提交；内嵌限制与声明冲突；预览和提交字节变化；失败/取消丢失当前角色；类型能力误导。

- [x] 授权/元数据纯逻辑：写失败测试、实现完整性及明确冲突检查，记录用户声明性质。
- [x] 主进程快照导入：四种格式，字节/图片/路径限制、随机令牌、取消、确认、旧模型补授权；测试不可绕过。
- [x] 2D及GLB渲染：隔离预览复用，能力显示，图片/分层/通用模型动作边界；原生渲染测试。
- [x] 四步向导：重选、授权、预览、最终确认与可选启用、记录查看；界面流程测试和截图。
- [x] 完整测试、生产构建、原生隔离检查、独立评审，更新用户操作说明。

Verification: 359 unit tests across61 files, 18 assistant/settings browser flows, production build, release configuration checks and native VRM/image2D/layered2D/GLB rendering passed. Review fixes: restrictive VRM1 defaults, derivative-sharing semantics, main-process preview proof, active draft expiry, legacy deletion, digest calculation. Feature remains local and unpublished.
