# AI Learning Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a secure OpenAI-compatible AI learning assistant to the Electron note editor, then publish version 0.2.0 with the pending sidebar fix.

**Architecture:** Keep provider credentials, URL validation, HTTP calls, response parsing, and AI IPC handlers in Electron main. Expose a typed, narrow `window.maji.ai` API through preload; renderer owns selection UI, settings UI, and explicit confirmation for note/exercise writes. Use the existing TipTap editor and exercise repository, with focused modules for provider service, AI settings, and selection assistance.

**Tech Stack:** Electron 44, TypeScript 7, React 19, TipTap 3, Electron `safeStorage`, Node fetch, Vitest, Testing Library, Playwright, electron-builder and GitHub Releases.

**Spec:** `docs/superpowers/specs/2026-09-28-ai-learning-assistant-design.md`

## Global Constraints

- Accept HTTPS remote provider URLs and HTTP only for `localhost`, `127.0.0.1`, or `[::1]`; reject credentials, fragments, other schemes, and renderer-selected request URLs.
- Store API keys only as Electron `safeStorage` ciphertext in an app `userData` config file; fail closed if encryption is unavailable.
- Keep secrets and note content out of logs, tests, repository files, CI variables, and release assets.
- Send selected text by default; whole-note context requires an explicit user choice and disclosure.
- Limit input to 12,000 UTF-16 code units, output to 16,000 UTF-16 code units, response body to 1 MiB, and each request to 45 seconds.
- Test connection with GET `/models`; never use a generation request as a connection test.
- Render model output as untrusted plain text; never parse or execute returned HTML/code.
- Do not write note content or create exercises until the user confirms the corresponding action.
- Keep browser preview AI unavailable; never make provider requests from renderer.
- Publish `0.2.0` by pushing `main` and tag `v0.2.0`; include the existing responsive sidebar fix and no API key.

## Review Focus

- **Encrypted-store failure / unreadable prior config:** saving must fail without plaintext fallback; malformed data must not reveal the key. Pin with injected safe-storage adapter tests in Task 2.
- **Hostile or ambiguous provider URL:** URL credentials, fragments, scheme tricks and non-loopback HTTP must be rejected before any network call. Pin in Task 1.
- **Oversized, malformed, slow, or secret-bearing HTTP response/error:** bound bytes/time, validate exercise JSON, and return sanitized Chinese errors. Pin in Task 3.
- **Selection lost when clicking floating controls or editor selection changes in flight:** use a captured range, avoid stealing focus, and insert after the original selection without replacing it. Pin in Task 6 and Task 8.
- **Viewport edge / narrow window positioning:** keep the toolbar and result panel reachable at editor edges and compact widths. Pin with component geometry tests and Playwright in Task 8.

---

## File Map

- Create `electron/main/ai/types.ts`, `validation.ts`, `storage.ts`, `client.ts`, and `service.ts` for validated settings, safeStorage-backed config, bounded provider requests, and orchestration.
- Modify `electron/main/index.ts`, `electron/main/ipc/handlers.ts`, `electron/preload/index.ts`, and `src/lib/ipc.ts` to initialize AI service and expose only typed AI IPC methods.
- Create `src/features/settings/AISettings.tsx` and `AISettings.module.css`; modify `src/components/layout/TopBar.tsx` and its styles to place AI provider configuration in Preferences.
- Create `src/features/notes/AISelectionAssistant.tsx` and `AISelectionAssistant.module.css`; modify `src/features/notes/NoteEditorPage.tsx` and `src/features/notes/notes.module.css` to bind editor selection, note/course context, and explicit writes.
- Add focused unit/component tests adjacent to AI modules and a Playwright flow in `e2e/flows.spec.ts`; preserve and test the pending sidebar fix.
- Modify `package.json` and its lockfile to version 0.2.0 after feature checks; inspect the release workflow before pushing `main` and `v0.2.0`.

### Task 1: Define AI contracts and reject invalid provider inputs

**Files:**
- Create: `electron/main/ai/types.ts`
- Create: `electron/main/ai/validation.ts`
- Test: `electron/main/ai/validation.test.ts`
- Modify: `src/lib/ipc.ts`

**Interfaces:**
- Produce `AIProviderSettings { baseUrl: string; model: string }`, `AISettingsStatus { configured: boolean; baseUrl: string; model: string; keyPresent: boolean }`, `AIAction = 'explain' | 'organize' | 'exercise'`, `AIContext { selectedText: string; noteText?: string; scope: 'selection' | 'note'; language: LanguageId }`, and `AIResult` as a discriminated union of `{ kind: 'text'; text: string }` or `{ kind: 'exercise'; title: string; prompt: string; hint: string; solution: string }`.
- Produce validators `validateProviderSettings(value)`, `validateAIContext(value)`, `validateAIAction(value)`, `validateAPIKey(value)`, and `validateProviderUrl(value)`; URL validation returns normalized base URL with trailing slash removed.

- [ ] **Step 1: Write failing tests** for each accepted URL class; reject `http` non-loopback, non-HTTP schemes, userinfo, fragment; reject empty/oversized model/key, selected text over 12,000 UTF-16 units, scope `note` without note text, and note text over 12,000 units.
- [ ] **Step 2: Run `npx vitest run electron/main/ai/validation.test.ts`** and confirm tests fail because the validators do not exist.
- [ ] **Step 3: Implement the interfaces and validators** in the stated files; keep all limits exact to the spec and do not silently truncate.
- [ ] **Step 4: Run `npx vitest run electron/main/ai/validation.test.ts`** and confirm all validation tests pass.
- [ ] **Step 5: Commit** as `feat: define AI provider contracts and validation`.

### Task 2: Store provider configuration with safeStorage

**Files:**
- Create: `electron/main/ai/storage.ts`
- Test: `electron/main/ai/storage.test.ts`
- Modify: `electron/main/index.ts`

**Interfaces:**
- `AIConfigStore` exposes `getStatus(): Promise<AISettingsStatus>`, `save(settings: AIProviderSettings, apiKey?: string): Promise<AISettingsStatus>`, and `clearKey(): Promise<AISettingsStatus>`.
- Constructor accepts `{ filePath, safeStorage: { isEncryptionAvailable(): boolean; encryptString(value: string): Buffer; decryptString(value: Buffer): string } }` for deterministic tests and Electron injection.
- Stored JSON contains provider settings and base64 ciphertext only; renderer-facing status never includes the key or ciphertext. Create with restrictive file permissions and replace via a same-directory temporary file plus rename.

- [ ] **Step 1: Write failing tests** for save/status, key replacement, key clearing, reload/decrypt, unavailable encryption, encryption failure, and corrupt/malformed config; assert no plaintext key is written and all failure messages omit secret values.
- [ ] **Step 2: Run `npx vitest run electron/main/ai/storage.test.ts`** and confirm tests fail before implementation.
- [ ] **Step 3: Implement atomic config writes under `app.getPath('userData')`** and fail closed when encryption is unavailable; expose a store instance from main bootstrap for the AI service.
- [ ] **Step 4: Run `npx vitest run electron/main/ai/storage.test.ts`** and confirm all storage tests pass.
- [ ] **Step 5: Commit** as `feat: securely store AI provider credentials`.

### Task 3: Implement bounded OpenAI-compatible client and service

**Files:**
- Create: `electron/main/ai/client.ts`
- Create: `electron/main/ai/service.ts`
- Test: `electron/main/ai/client.test.ts`
- Test: `electron/main/ai/service.test.ts`

**Interfaces:**
- `AIService` exposes `getSettings(): Promise<AISettingsStatus>`, `saveSettings(settings, apiKey?): Promise<AISettingsStatus>`, `clearKey(): Promise<AISettingsStatus>`, `testConnection(): Promise<void>`, and `ask(action: AIAction, context: AIContext): Promise<AIResult>`.
- Provider transport accepts injected `{ fetch, now? }` for tests; production uses main-process fetch and the fixed base URL plus `/chat/completions` or `/models`.
- Exercise completions must parse as `{ title, prompt, hint, solution }`, each nonempty and bounded; text completions return plain text only.

- [ ] **Step 1: Write failing client/service tests** for request method/path/body/authorization, selected-only default prompt, explicit whole-note scope, 45-second abort, 1 MiB response cap, non-2xx/429/timeout/offline/malformed JSON, exercise schema/field limits, and sanitized errors that do not contain key, URL, headers, prompt or response body.
- [ ] **Step 2: Run `npx vitest run electron/main/ai/client.test.ts electron/main/ai/service.test.ts`** and confirm failure.
- [ ] **Step 3: Implement fixed-path provider transport and action prompts**; use `GET /models` only for test, no automatic generation retries, enforce response bytes while reading, and convert known failure classes to concise Chinese messages.
- [ ] **Step 4: Run the two AI client/service test files** and confirm all cases pass, including a fetch spy that proves no call happens before a user action.
- [ ] **Step 5: Commit** as `feat: add bounded OpenAI-compatible AI service`.

### Task 4: Wire AI service through main, IPC and preload

**Files:**
- Modify: `src/lib/ipc.ts`
- Modify: `electron/preload/index.ts`
- Modify: `electron/main/ipc/handlers.ts`
- Modify: `electron/main/index.ts`
- Test: `electron/main/ai/ipc.test.ts`

**Interfaces:**
- Add `MajiApi.ai` methods exactly matching Task 3: `getSettings`, `saveSettings`, `clearKey`, `testConnection`, `ask`.
- Add corresponding `IPC.aiSettingsGet`, `aiSettingsSave`, `aiSettingsClearKey`, `aiTestConnection`, and `aiAsk` channels; register only these explicit channels and validate every payload in main.
- Inject `AIService` into `registerIpcHandlers` alongside `UpdateService`; do not expose generic fetch or filesystem IPC.

- [ ] **Step 1: Write failing IPC tests** that invalid payloads are rejected before service calls, valid arguments reach only the named method, status cannot include a key, and unregistered arbitrary channels remain unavailable.
- [ ] **Step 2: Run `npx vitest run electron/main/ai/ipc.test.ts`** and confirm tests fail before channels/service wiring exists.
- [ ] **Step 3: Add typed channel declarations and preload methods** in both mirrored channel maps; create safeStorage-backed store and AI service in `bootstrap()` before registering IPC.
- [ ] **Step 4: Run `npx vitest run electron/main/ai/ipc.test.ts` and `npm run typecheck`**; expect both to pass with renderer unable to retrieve credential bytes.
- [ ] **Step 5: Commit** as `feat: expose typed AI operations over IPC`.

### Task 5: Add AI provider settings to Preferences

**Files:**
- Create: `src/features/settings/AISettings.tsx`
- Create: `src/features/settings/AISettings.module.css`
- Test: `src/features/settings/AISettings.test.tsx`
- Modify: `src/components/layout/TopBar.tsx`
- Modify: `src/components/layout/TopBar.module.css`

**Interfaces:**
- `AISettings` component calls `window.maji?.ai` and receives an optional `onNotice(message, tone)` callback; no provider secret is stored in `UserSettings` or browser storage.
- Render base URL, model, password-masked API key, status, “测试连接”, “保存设置”, and “清除密钥”; browser mode explains desktop-only support.

- [ ] **Step 1: Write component tests** for configured/unconfigured/browser states, masked key input, validation and failed/successful connection, settings save/clear, and verify rendered status never contains a saved key; add a first-use notice test confirming selection transmission and a direct path back to AI settings.
- [ ] **Step 2: Run `npx vitest run src/features/settings/AISettings.test.tsx`** and confirm it fails before the component exists.
- [ ] **Step 3: Implement the settings component and add it to Preferences** with explanatory privacy copy; preserve existing theme/editor/update settings.
- [ ] **Step 4: Run the component test and `npm run typecheck`** and confirm pass.
- [ ] **Step 5: Commit** as `feat: add AI provider preferences`.

### Task 6: Implement the selection assistant UI and selection lifecycle

**Files:**
- Create: `src/features/notes/AISelectionAssistant.tsx`
- Create: `src/features/notes/AISelectionAssistant.module.css`
- Test: `src/features/notes/AISelectionAssistant.test.tsx`
- Modify: `src/features/notes/NoteEditorPage.tsx`
- Modify: `src/features/notes/notes.module.css`

**Interfaces:**
- Component props: `{ editor: Editor | null; editable: boolean; noteId: string; noteText: string; language: LanguageId; courseId: string; onCreateExercise(input: ExerciseInput): Promise<void>; onOpenSettings(): void }`.
- Use Tiptap selection and `editor.view.coordsAtPos` to capture selected text, original range, and anchor; retain captured range when toolbar receives pointer input; invalidate selection when selection becomes empty, editor/note changes, or panel closes.
- Action controls are `explain`, `organize`, and `exercise`; initial request scope is `selection` and note-scope toggle warns before sending the full note.

- [ ] **Step 1: Write failing component tests** for no-selection state/no request, captured selected text, editor preview state hiding controls, explicit full-note disclosure, close/Escape/note-change reset, selection/cursor preservation, browser desktop-only hint, input-over-limit rejection without truncation, and duplicate submission prevention while loading.
- [ ] **Step 2: Run `npx vitest run src/features/notes/AISelectionAssistant.test.tsx`** and confirm it fails before implementation.
- [ ] **Step 3: Implement a selection observer and anchored action bar** without adding a dependency; render actions only for editable nonempty text selections and call `window.maji.ai.ask` on explicit action clicks.
- [ ] **Step 4: Run the component tests** and confirm all selection lifecycle assertions pass.
- [ ] **Step 5: Commit** as `feat: add contextual AI selection actions`.

### Task 7: Add result preview, safe insertion and confirmed exercise creation

**Files:**
- Modify: `src/features/notes/AISelectionAssistant.tsx`
- Modify: `src/features/notes/AISelectionAssistant.module.css`
- Modify: `src/features/notes/NoteEditorPage.tsx`
- Test: `src/features/notes/AISelectionAssistant.test.tsx`

**Interfaces:**
- Result state supports loading, sanitized error with retry, text/exercise result, copy, regenerate, close, “插入到笔记”, and for valid exercise “添加为关联练习”.
- `onCreateExercise` maps to `useLibrary().createExercise` with `noteId`, `courseId`, current `language`, and difficulty `easy`.
- Insertion restores the captured editor selection and appends ordinary paragraph text after it; it never replaces selected content and never inserts parsed HTML.

- [ ] **Step 1: Add failing interaction tests** proving response preview causes no editor/library writes; insertion appends only after explicit click while preserving source selection; exercise creation only after explicit click with correct association; copy/retry/error/close behavior works.
- [ ] **Step 2: Run the focused test** and confirm the explicit-write tests fail before result actions are implemented.
- [ ] **Step 3: Implement result rendering and confirmed actions**; restore the captured range before insertion, insert as plain text paragraph(s), and call existing `createExercise` only from the confirmation control.
- [ ] **Step 4: Run all AI selection component tests** and confirm every mutation requires explicit user action.
- [ ] **Step 5: Commit** as `feat: add safe AI result actions`.

### Task 8: Verify viewport behavior, browser flow and existing sidebar fix

**Files:**
- Modify: `src/features/notes/AISelectionAssistant.tsx`
- Modify: `src/features/notes/AISelectionAssistant.module.css`
- Modify: `e2e/flows.spec.ts`
- Existing uncommitted changes: `src/app/AppLayout.tsx`, `src/components/layout/AppSidebar.module.css`, `e2e/flows.spec.ts`

**Interfaces:**
- Positioning uses captured editor coordinates, flips above/below and left/right as needed, clamps to viewport with a 12px inset, and recomputes on editor scroll, window resize, and result-panel resize.
- E2E uses a mocked `window.maji.ai` provider and no external network.

- [ ] **Step 1: Add Playwright flows** for configure/save/test mocked provider, selecting text and invoking explain, full-note consent disclosure, no automatic note/exercise writes, explicit insert/exercise create, plus sidebar expand/collapse at 1100px and 900px.
- [ ] **Step 2: Run `npm run test:e2e -- --grep "AI assistant|sidebar"`** and confirm any missing flow fails; exercise menu near all four viewport edges and a compact 900px window.
- [ ] **Step 3: Implement or adjust floating panel geometry and retain the pending `AppLayout`/sidebar scrim fix** until all new and existing focused flows pass.
- [ ] **Step 4: Run the focused E2E suite and `npm run test:release-config`**; both must pass.
- [ ] **Step 5: Commit** as `test: cover AI assistant and compact sidebar flows`.

### Task 9: Run release checks, version 0.2.0, push and verify GitHub update

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Review: `.github/workflows/*` release workflow and `electron-builder.config.cjs`

**Interfaces:**
- Release tag is exactly `v0.2.0`; package version is exactly `0.2.0`; workflow must publish the Windows NSIS installer and `latest.yml` without AI credentials.

- [ ] **Step 1: Run full local checks**: `npm run typecheck`, `npm test`, `npm run test:e2e`, `npm run build`, and `npm run test:release-config`; record any pre-existing failure separately and resolve all failures introduced by this work.
- [ ] **Step 2: Inspect `.github/workflows/release-windows.yml`, `electron-builder.config.cjs`, and local Git diff/status**; ensure only intended feature, sidebar fix, spec, plan, and version files are included and no credential appears in tracked or staged files.
- [ ] **Step 3: Update package and lockfile to 0.2.0** and rerun typecheck, unit tests, build, and release-config checks; confirm installed metadata reports 0.2.0.
- [ ] **Step 4: Commit** the reviewed release changes with message `release: publish 0.2.0`.
- [ ] **Step 5: Push `main` and tag `v0.2.0`** to `origin`; wait for the GitHub Release workflow and confirm release assets include the installer and `latest.yml`.
- [ ] **Step 6: Report** the pushed commit, release link, workflow result, checks, and any baseline failures; do not claim update availability until the release assets are verified.
