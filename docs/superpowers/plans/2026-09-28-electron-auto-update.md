# Electron Auto-Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe GitHub Releases updates to the Windows NSIS build, including status, download progress, manual check, and user-confirmed restart/install.

**Architecture:** `electron-updater` stays in the Electron main process. A small updater service translates updater events to a narrow typed status API through preload; the existing preference dialog displays that status and exposes check/install actions via a focused update settings component. A dynamic electron-builder config reads the public repository slug from `MAJI_GITHUB_REPOSITORY`/`GITHUB_REPOSITORY`; a tag-triggered GitHub Actions workflow builds and publishes Windows assets only when explicitly invoked by a version tag.

**Tech Stack:** Electron 44, electron-updater, electron-builder 26, React 19, TypeScript, Vitest, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-28-electron-auto-update-design.md`

## Global Constraints

- Windows distribution remains NSIS x64.
- Do not check updates in development, smoke-test, or browser-only mode.
- Keep all updater operations in the main process and expose only check, install, and typed status subscription methods through preload.
- Never embed release tokens in app code or packaged files.
- `npm run package` must remain local-only; publishing must be explicit and tag-triggered.
- Do not install an update automatically on download; only install after the user confirms restart.
- Preserve the local SQLite database and the existing close/save handshake.
- The confirmed public GitHub repository is `zh2335897181-cell/maji`; it has been created and is currently empty.
- This local folder still has no `.git` worktree/remote; source upload and release validation are not authorized or available yet.

## Review Focus

- Dev/browser build without update metadata: show an explanatory unavailable state and make no network request.
- Network, GitHub rate-limit, missing release asset, or malformed update metadata: show an actionable error and keep the current app running.
- Repeated manual checks or duplicate updater events: avoid overlapping checks and keep status transitions coherent.
- Download complete while unsaved editor content exists: use the existing close/save handshake before installing.
- Missing repository slug in a local package build: don't infer a destination or publish; the app should explain that this build has no update feed.

---

### Task 1: Add a testable updater service

**Files:**
- Create: `electron/main/updates.ts`
- Test: `electron/main/updates.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces `UpdateStatus` as a discriminated union in `src/lib/ipc.ts` (defined in Task 2); the service emits only those status objects.
- Service factory accepts an updater-compatible adapter, `isPackaged`, `platform`, and current version so behavior can be unit tested without network access.
- Public service methods: `checkForUpdates(): Promise<void>`, `installDownloadedUpdate(): void`, `subscribe(listener): unsubscribe`.
- `subscribe` immediately emits the current status so the renderer does not miss startup checks completed before a settings dialog opens.

- [x] **Step 1: Write failing service tests** for unsupported/dev builds, one manual check, no-update, update-available, monotonically forwarded download progress in `[0,100]`, downloaded, errors, and rejecting install before download.
- [x] **Step 2: Run** `npx vitest run electron/main/updates.test.ts`; confirm expected missing-service failures.
- [x] **Step 3: Add `electron-updater` and implement the event adapter.** Set `autoDownload = true`, `autoInstallOnAppQuit = false`; reject overlapping check calls; do not expose error stack/token/URLs in UI state.
- [x] **Step 4: Re-run** `npx vitest run electron/main/updates.test.ts`; all service transition and gating tests pass.

### Task 2: Wire the updater through main process and preload

**Files:**
- Modify: `src/lib/ipc.ts`
- Modify: `electron/preload/index.ts`
- Modify: `electron/main/index.ts`
- Modify: `electron/main/ipc/handlers.ts` or a focused `electron/main/updates-ipc.ts`
- Test: updater IPC tests alongside `electron/main/updates.test.ts`

**Interfaces:**
- `window.maji.updates.check(): Promise<void>`.
- `window.maji.updates.install(): Promise<void>`; preload first runs all registered note-save handlers and only invokes the main-process installer if every handler succeeds.
- `window.maji.updates.getStatus(): Promise<UpdateStatus>`; restore the main-process current state after renderer reload.
- `window.maji.updates.onStatus(handler: (status: UpdateStatus) => void): () => void`.
- `UpdateStatus` variants: `unsupported`, `idle`, `checking`, `latest`, `available`, `downloading` (version + percent), `downloaded` (version), and `error` (safe message).

- [x] **Step 1: Add tests** that verify each exposed operation uses only its allow-listed channel and that subscriptions can be removed.
- [x] **Step 2: Implement** the typed IPC constants and `MajiApi.updates` methods; mirror every channel name exactly in preload.
- [x] **Step 3: Register the service once at app bootstrap.** Broadcast status only to live app windows; invoke automatic check a few seconds after packaged Windows startup, excluding `MAJI_SMOKE_TEST` and development.
- [x] **Step 4: Require an explicit configured feed before checking.** Embed a public repository slug in package `extraMetadata` only when `MAJI_GITHUB_REPOSITORY` is set; a local package without it must report `unsupported` with a clear explanation rather than guessing a GitHub repo.
- [x] **Step 5: Test** type alignment and status IPC, then run `npm run typecheck` and the focused Vitest suite.

### Task 3: Add update controls to preferences

**Files:**
- Modify: `src/components/layout/TopBar.tsx`
- Modify: `src/components/layout/TopBar.module.css`
- Create: `src/components/layout/UpdateSettings.tsx`
- Create: `src/components/layout/UpdateSettings.module.css`
- Test: `src/components/layout/UpdateSettings.test.tsx`

**Interfaces:**
- Consume `window.maji.updates` directly; no updater API is added to `MajiRepository` because browser localStorage mode has no desktop updater.
- Reuse the existing preference modal and `useToast()` for concise event feedback.

- [x] **Step 1: Add UI tests** for unsupported mode, manual check state, percent progress, downloaded restart/later choices, and failure retry.
- [x] **Step 2: Implement** a compact “应用更新” group showing current version, status text/progress, “检查更新”, and “立即重启并安装” only after download completes.
- [x] **Step 3: Verify `updates.install()` does not call main IPC if any registered save handler fails;** keep the modal open and show the error.
- [x] **Step 4: Subscribe from the mounted TopBar and remove the listener on unmount** so startup checks remain visible in the preferences modal and can create toast feedback.
- [x] **Step 5: Run** the focused UI tests and `npm run typecheck`.

Ruling: Update controls live in `UpdateSettings` to keep the existing TopBar settings dialog readable and allow isolated component tests; `TopBar` owns the always-mounted subscription and toast effects.

### Task 4: Add explicit GitHub release configuration and workflow

**Files:**
- Create: `electron-builder.config.cjs`
- Modify: `package.json`
- Create: `.github/workflows/release-windows.yml`
- Create: `docs/updates.md`

**Interfaces:**
- Build config reads `MAJI_GITHUB_REPOSITORY` (local explicit slug) or `GITHUB_REPOSITORY` (Actions context), validates `owner/repo`, and only adds a GitHub publish provider when present.
- The release workflow sets `MAJI_GITHUB_REPOSITORY: ${{ github.repository }}` and uses `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` only for publishing.
- Release script is separate from `npm run package`; only version tags trigger `electron-builder --publish always`.

- [x] **Step 1: Add config tests** for valid `owner/repo`, missing repo, malformed slug, and expected repository `zh2335897181-cell/maji`.
- [x] **Step 2: Implement dynamic builder config** while preserving current NSIS/icon/asar settings; missing slug must omit publish config instead of inferring a repository.
- [x] **Step 3: Add a tag-only Windows workflow** that runs `npm ci`, typecheck, tests, and builds/publishes the NSIS installer plus `latest.yml`/blockmap as a non-draft release.
- [x] **Step 4: Keep ordinary packaging local-only** and document the first manual installation requirement, version tag format, release notes, public repository requirement, and code-signing caveat.
- [x] **Step 5: Validate** the config without publishing, inspect workflow YAML, and run `npm run package`.

### Task 5: End-to-end local verification

**Files:**
- Modify: `electron/main/smoke.ts`
- Test: smoke startup/close/update IPC path

- [x] **Step 1: Extend smoke tests** to probe updater API presence, unsupported state in local/dev build, and safe no-network behavior.
- [x] **Step 2: Run** `npm run typecheck`, `npm run test`, and `npm run package`.
- [x] **Step 3: Launch the packaged app with a fresh temporary user-data directory** and verify startup, bridge, updater unavailable state without a configured repo, and close/save behavior.
- [x] **Step 4: Record external validation as pending** until the user supplies the full repository and a tagged GitHub Release is available; do not publish or push from this folder.

## Handoff Notes

- The user approved the GitHub Releases design and created the public repository `zh2335897181-cell/maji`.
- A working packaged update feed and release workflow require this local project to be connected to that repository and a first tagged Release to be published.
- No Git repository metadata is currently present in this directory; do not initialize, push, or publish source without explicit authorization.
