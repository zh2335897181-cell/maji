# AI 每日复习会话 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在码迹中构建 AI 每日练习、答案评阅、会话恢复和每日复习记录。

**Architecture:** React 复习页调用类型化 AI IPC，由 Electron 主进程复用现有 AI 凭据和 HTTP 客户端；会话与题目保存到 SQLite，仓库接口同时由浏览器 localStorage 示例实现。AI 评分留在练习记录，只有用户明确确认后才调用现有知识点复习动作。

**Tech Stack:** Electron 44、React 19、TypeScript、Vite、better-sqlite3、CSS Modules、Vitest、Playwright。

**Spec:** `docs/superpowers/specs/2026-09-29-ai-review-sessions-design.md`

## Global Constraints

- 代码题采用静态评阅，不在应用中执行用户提交的代码。
- 仅在用户确认后把所选笔记的必要内容发送给其配置的模型服务。
- API 密钥沿用系统安全存储，绝不写进会话记录或日志。
- AI 评分只进入练习会话数据，不自动改变 `review_items`。
- 数据库存储使用追加 `PRAGMA user_version` 迁移。

## Review Focus

- 笔记文本超过 AI 上下文限制：生成前裁剪或拒绝并说明，不截断题目来源而不提示。覆盖 Task 3。
- AI 返回缺字段、错误题型、超范围分数或超长内容：拒绝该结果，同时保留会话答案。覆盖 Task 1 与 Task 3。
- 暂停、恢复及跨午夜：只累计活跃时段，按本地日期切分。覆盖 Task 2 与 Task 4。
- 来源笔记被改名或删除：历史仍显示会话保存的快照。覆盖 Task 2 与 Task 4。
- 模型超时或评阅失败：保存用户答案，允许重试且不重复计时。覆盖 Task 3 与 Task 4。

---

### Task 1: 定义 AI 练习与复习会话领域契约

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/ipc.ts`
- Modify: `electron/main/ai/types.ts`
- Modify: `electron/main/ipc/validate.ts`
- Modify: `electron/preload/index.ts` (thin typed channel wrappers; AI handlers remain Task 3)
- Test: `electron/main/ipc/validate-review-session.test.ts`

**Interfaces:**
- Define `ReviewDepth = 'quick' | 'standard' | 'deep'`, `ReviewQuestionType = 'concept' | 'short-answer' | 'code-reading' | 'code-writing' | 'code-fix'`, and typed question/grade/session/source snapshot records in `src/lib/types.ts`.
- Define `ReviewSourceSnapshot { noteId: string | null; noteTitle: string; courseName: string; contentExcerpt: string; reviewItemIds: string[] }`, `GeneratedReviewQuestion { type; difficulty; title; prompt; hint; referenceAnswer; explanation; language; sourceNoteId: string | null }`, `ReviewGrade { score: number; rationale: string; omissions: string[]; feedback: string; referenceAnswer: string; explanation: string }`, and `ActiveTimeSegment { startedAt: string; endedAt: string }` in `src/lib/types.ts`.
- Define `ReviewSessionInput { scope: 'due' | 'course' | 'notes'; depth; plannedQuestionCount; sources: ReviewSourceSnapshot[]; questions: GeneratedReviewQuestion[] }`, `ReviewSessionPatch { status?; activeSegments?; activeSegmentStartedAt?; endedAt? }`, `ReviewSessionFilter { fromDate?; toDate?; status? }`, `ReviewQuestionAnswerInput { questionId; answer }`, and `ReviewQuestionGradeInput { questionId; grade: ReviewGrade }`; grades use integer `score` constrained to 0–100.
- Define `ReviewGenerationInput { sources: ReviewSourceSnapshot[]; depth: ReviewDepth; count: number; language: LanguageId }` and `ReviewGradingInput { question: GeneratedReviewQuestion; answer: string }` for the AI service.
- Define session statuses as `'in-progress' | 'completed'`; summaries include session id, local date, status, depth, duration seconds, question count, and average score.
- Add `ai.review.generate(input): Promise<GeneratedReviewQuestion[]>` and `ai.review.grade(input): Promise<ReviewGrade>` to `MajiApi`; add typed validation entry points for both inputs.

- [x] **Step 1: Write failing validation tests** for allowed question/depth enums and valid 0/100 scores; assert invalid enum, score -1/101, empty answer, and oversized prompt are rejected.
- [x] **Step 2: Run `npx vitest run electron/main/ipc/validate-review-session.test.ts`** and confirm the new imports/functions fail before implementation.
- [x] **Step 3: Implement the domain and IPC input types** and validators with explicit per-field limits matching existing IPC validation style.
- [x] **Step 4: Run `npx vitest run electron/main/ipc/validate-review-session.test.ts`** and confirm all validation cases pass.

### Task 2: Persist sessions, questions, answers and active-time segments

**Files:**
- Modify: `electron/main/db/schema.ts`
- Modify: `electron/main/db/mappers.ts`
- Modify: `electron/main/db/library.ts`
- Modify: `electron/main/db/seed.ts`
- Modify: `src/lib/repository.ts`
- Modify: `src/lib/localRepository.ts`
- Modify: `src/lib/ipc.ts`
- Modify: `electron/main/ipc/handlers.ts`
- Modify: `electron/main/ipc/validate.ts`
- Modify: `electron/preload/index.ts`
- Test: `src/lib/localRepository.test.ts`
- Test: `electron/main/db/reviewSessions.test.ts`
- Test: `electron/main/db/schema.test.ts`

**Interfaces:**
- `MajiRepository.reviewSessions`: `list(filter?: ReviewSessionFilter): Promise<ReviewSessionSummary[]>`, `get(id: string): Promise<ReviewSessionWithQuestions | null>`, `create(input: ReviewSessionInput): Promise<ReviewSessionWithQuestions>`, `update(id: string, patch: ReviewSessionPatch): Promise<ReviewSessionWithQuestions>`, `saveAnswer(sessionId: string, input: ReviewQuestionAnswerInput): Promise<ReviewQuestion>`, and `saveGrade(sessionId: string, input: ReviewQuestionGradeInput): Promise<ReviewQuestion>`.
- Add `reviewSessions` / `reviewQuestions` SQLite tables. Store source snapshot JSON without a note foreign key, and persist active-time segments (`startedAt`, `endedAt`) so pauses and local-midnight summaries are accurate.
- Bump schema version to 4 and migrate v3 databases additively; keep existing review rows and data unchanged.

- [x] **Step 1: Add failing local-repository tests** for create/get, answer and grade persistence, updates, abandoned-session recovery, daily list filtering, and snapshots surviving note rename/deletion.
- [x] **Step 2: Run `npx vitest run src/lib/localRepository.test.ts`** and confirm the new repository methods and behaviors fail.
- [x] **Step 3: Implement local repository session storage** using the same persistence envelope as existing example data.
- [x] **Step 4: Add failing SQLite tests** for schema v3→v4 migration, transaction-safe session/question writes, answer/grade round trips, and snapshot retention after note deletion.
- [x] **Step 5: Run `npx vitest run electron/main/db/reviewSessions.test.ts electron/main/db/schema.test.ts`** and confirm the database cases fail before the implementation.
- [x] **Step 6: Implement SQLite tables, mappers, migration, repository functions and validated IPC/preload methods**; ensure a question/answer write and its session timestamp update occur in one transaction.
- [x] **Step 7: Run `npx vitest run src/lib/localRepository.test.ts electron/main/db/reviewSessions.test.ts electron/main/db/schema.test.ts`** and confirm all persistence and migration cases pass.

### Task 3: Generate structured questions and AI grading

**Files:**
- Modify: `electron/main/ai/client.ts`
- Modify: `electron/main/ai/service.ts`
- Modify: `electron/main/ai/ipc.ts`
- Modify: `src/lib/ipc.ts`
- Modify: `electron/preload/index.ts`
- Test: `electron/main/ai/review.test.ts`
- Test: `electron/main/ai/validation.test.ts`

**Interfaces:**
- `AIService.generateReview(input: ReviewGenerationInput): Promise<GeneratedReviewQuestion[]>` and `AIService.gradeReviewAnswer(input: ReviewGradingInput): Promise<ReviewGrade>`.
- Use dedicated `ai.review.generate` and `ai.review.grade` IPC methods. Do not expand the legacy `AIContext` with unbounded arbitrary note content.
- Generation inputs include scope snapshots, depth, count and language; grading inputs include one question, expected answer/rubric and user answer. Outputs must parse into the types from Task 1.

- [x] **Step 1: Write failing AI client tests** for all five supported question types, strict JSON parsing, 0–100 grading, malformed/oversized response rejection, and a prompt that treats note material as untrusted.
- [x] **Step 2: Run `npx vitest run electron/main/ai/review.test.ts`** and verify generation/grading methods are missing.
- [x] **Step 3: Implement dedicated prompts and parsers**; require question count to match the request and never execute submitted code.
- [x] **Step 4: Add failing AI service/IPC tests** for missing credentials, input validation, note-context upper bounds, and response forwarding.
- [x] **Step 5: Run `npx vitest run electron/main/ai/validation.test.ts electron/main/ai/review.test.ts`** and confirm those cases fail.
- [x] **Step 6: Implement service validation and IPC forwarding** through the existing secure credential store and network client.
- [x] **Step 7: Run `npx vitest run electron/main/ai`** and confirm the AI package tests pass.

### Task 4: Build setup, session runner and history views

**Files:**
- Modify: `src/features/review/ReviewPage.tsx`
- Modify: `src/features/review/review.module.css`
- Create: `src/features/review/ReviewSessionSetup.tsx`
- Create: `src/features/review/ReviewSessionRunner.tsx`
- Create: `src/features/review/ReviewSessionHistory.tsx`
- Create: `src/features/review/reviewSession.ts`
- Create: `src/features/review/reviewSession.test.ts`
- Modify: `src/app/LibraryProvider.tsx`
- Modify: `src/lib/repository.ts`
- Test: `src/features/review/ReviewPage.test.tsx`

**Interfaces:**
- `getActiveSecondsByLocalDay(segments: ActiveTimeSegment[], activeSegmentStartedAt?: string | null, now?: Date): Map<string, number>` splits active intervals at local midnight, includes an open segment only through `now`, and ignores paused time.
- Setup calls `window.maji.ai.review.generate` only after the explicit note-scope confirmation, then persists the generated session through `MajiRepository.reviewSessions.create`.
- Runner saves each answer before calling AI grading; on failure, it leaves the answer saved and exposes retry. Timer segments persist on pause, navigation and periodic checkpoint.
- History displays per-day total duration, session count, note snapshot labels, depth, count and scores; detail exposes each question, answer and explanation.

- [x] **Step 1: Add failing pure-logic tests** for duration formatting, local-midnight splitting, pauses and zero-length segments.
- [x] **Step 2: Run `npx vitest run src/features/review/reviewSession.test.ts`** and verify helpers are missing.
- [x] **Step 3: Implement the time aggregation helpers** and tests for time-zone-local day boundaries.
- [x] **Step 4: Add failing UI tests** for selection confirmation before AI calls, unconfigured AI routing, saved answer plus grading retry, resume, completion summary and daily history.
- [x] **Step 5: Run `npx vitest run src/features/review/ReviewPage.test.tsx`** and confirm the new flows fail before implementation.
- [x] **Step 6: Implement setup, runner and history components** using existing Button/Tag/EmptyState patterns and LibraryProvider repository methods.
- [x] **Step 7: Implement completion-time confidence confirmation**; only on explicit choice call existing `applyReviewAction` for the associated review items.
- [x] **Step 8: Run `npx vitest run src/features/review`** and confirm review component and logic tests pass.

### Task 5: Verify full data paths and desktop flows

**Files:**
- Modify: `e2e/flows.spec.ts`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/DESIGN.md` only if the app's documented navigation or review behavior changes.

**Interfaces:**
- Electron mode uses SQLite + AI IPC; browser mode uses the local repository for session persistence and can show configured-AI-unavailable guidance.
- The existing review page remains reachable through the existing `/review` route and sidebar item.

- [x] **Step 1: Add Playwright coverage** for create an AI review session with mocked AI result, answer and grade, resume after reload, inspect daily history, and confirm review scheduling changes only after explicit user action.
- [x] **Step 2: Run `npm run typecheck`** and fix type/interface mismatches.
- [x] **Step 3: Run `npm test`** and confirm the full unit suite passes.
- [x] **Step 4: Run the targeted Playwright review flow** using the project's configured command and verify both supported desktop viewport sizes where applicable.
- [x] **Step 5: Run `npm run build`** and confirm production compilation succeeds.
- [x] **Step 6: Update architecture docs** with the review-session tables, typed AI calls and retention behavior.

---

## Plan self-review

- **Spec coverage:** generation scope/depth/count → Tasks 1, 3, 4; question formats and grading → Tasks 1, 3, 4; consent and context limits → Tasks 3, 4; session persistence/recovery/snapshot retention/daily time → Tasks 2, 4; explicit scheduling update → Tasks 4, 5; migration and validation → Tasks 1, 2, 5.
- **Step scan:** each test step states behavior and command; each implementation step names an API or component boundary; no generic “handle edge cases” task remains.
- **Type consistency:** the repository and AI interfaces use distinct generation, grade, session and question types; session timing uses active segments consistently for pause and midnight aggregation.
- **Review focus mapping:** all five input/failure classes are pinned to tests in the owning tasks.
- **Proportion:** five tasks follow existing project boundaries without introducing dependencies or splitting the feature into unrelated sub-projects.
