# Desktop Assistant Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 添加可配置形象的 Live2D 桌面 AI 助手。
**Architecture:** 主进程管理配置、导入、窗口和聊天；React 设置及聊天；跨来源隔离 iframe 运行 Live2D。
**Tech Stack:** Electron, React, TypeScript, PixiJS 6, pixi-live2d-display 0.4.
**Spec:** ../specs/2026-11-13-desktop-assistant-design.md

## Global Constraints

默认关闭，不自动读取学习数据，不再分发 Core/角色，固定配套渲染版本，导入失败保留原配置，禁止外网模型引用。

## Review Focus

模型引用 ../ 或 URL；复制中途失败；取消后旧回复污染新对话；多屏变化位置不可见；Core 缺失或模型加载失败不能白屏。

### Task 1: 存储与校验

Files: src/lib/assistant.ts, electron/main/assistant/assets.ts, assets.test.ts.
Interface: AssistantSettings/AssistantApi; importModel(file), importCore(file), asset(path).
- [x] Write and run failing tests for unsafe refs, missing files, persisted settings and failed import.
- [x] Implement bounded reference collection and atomic configuration commits.
- [x] Run native unit tests.

### Task 2: 窗口与聊天

Files: electron/main/assistant/service.ts, protocol.ts, electron/preload/assistant.ts, index.ts; AIClient/AIService.
Interface: settings, update, importModel, importCore, show, hide, resizeChat, chat, cancel, clear.
- [x] Test bounded multi-turn context and cancellation.
- [x] Create transparent window, restricted preload and isolated resource protocol.
- [x] Wire main settings API and lifecycle, run typecheck and native tests.

### Task 3: 设置与 Live2D

Files: src/features/assistant/*, assistant.html, avatar.html, vite.config.ts, TopBar.tsx.
- [x] Build settings with import/enable/model/name/personality/size/top/follow controls.
- [x] Add separate assistant entry with draggable toolbar, accessible chat, cancel/clear/retry and model status.
- [x] Add lazy isolated Live2D renderer, tracking, expressions and motions, destroy on unload, 30 FPS cap.
- [x] Verify settings and chat with browser tests and screenshots; run full unit tests and build.

## Ledger

Ruling: user approved preceding feature proposal; execute inline in existing clean checkout. No publication requested for this feature.

Verification: 336 unit tests, 14 assistant/settings browser flows, production build and native Electron isolation/lifecycle smoke passed. Review findings on history bound, cancellation and window recreation were fixed. Real licensed Core/model rendering remains unverified because the user has no assets. Feature remains local and unpublished.
