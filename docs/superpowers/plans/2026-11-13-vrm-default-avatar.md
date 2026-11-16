# VRM Default Avatar Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for inline implementation.

**Goal:** 用户无需建模或安装 SDK 即可使用内置桌面角色。
**Architecture:** 替换未发布的 Live2D renderer/assets importer，继续使用独立 iframe 与现有窗口/聊天桥接。
**Tech Stack:** Three.js 0.187.0, @pixiv/three-vrm 3.5.5, Electron, React.
**Spec:** ../specs/2026-11-13-vrm-default-avatar-design.md

## Global Constraints

随包角色必须有明确再分发许可，保存来源与摘要；无 Core/外部纹理/运行时下载；聊天不自动读取学习数据。

## Review Focus

外部模型 URL、默认角色误删、旧设置兼容、角色大小与朝向、取消请求迟到结果。

- [x] 核对角色作者来源、CC0 与内嵌授权字段，保存不修改的 binary 和 SHA256。
- [x] 更新资产单元测试，观察旧 importer 失败，替换为 VRM binary 校验和复制。
- [x] 删除 Live2D/Pixi 依赖与 Core IPC，设置支持默认角色和自定义 VRM。
- [x] 接入 Three/VRM，渲染透明角色、目光、表情、程序动作，限制30FPS。
- [x] 运行单元、界面和原生 Electron 验证；检查实际截图并完成评审。

Verification: 336 unit tests, 14 assistant/settings UI flows, native bundled VRM rendering/gestures/chat/isolation/recreation, build and4 release-config checks passed. Independent review found no important issues; removed misleading empty-model selector. Not published.
