---
id: PLAN-001
status: draft
version: 0.1
owner: Разработчик интерфейса / владелец продукта (роли; персональное назначение отсутствует)
approved_by: Не утверждено; ожидает review после одобрения SPEC-004
last_reviewed: 2026-09-24
scope: Реализация интерфейсного MVP CV Maker по SPEC-004
---

# CV Maker Web Interface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Создать тестируемый веб-интерфейс CV Maker, который ведёт пользователя от подтверждения профиля через настройку поиска к ручному подтверждению отклика.

**Architecture:** Frontend — React + TypeScript + Vite. Доменная логика готовности профиля, активации поиска и блокировки отправки реализуется в чистых функциях без зависимости от React. UI использует typed service adapters: сначала fixture-адаптеры для разработки экранов, затем API-адаптеры без изменения компонентов.

**Tech Stack:** Node.js, TypeScript, React, Vite, React Router, Vitest, Testing Library, Playwright для критического E2E-сценария.

**Spec:** [SPEC-004 — Дизайн веб-интерфейса CV Maker](../specs/2026-09-24-cv-maker-web-interface-design.md)

## Global Constraints

- Профиль хранит подтверждённые факты, а резюме является производным представлением под конкретную вакансию.
- Агент не изменяет подтверждённую базу опыта без действия пользователя.
- Поиск недоступен до выполнения необходимого и достаточного критерия готовности профиля.
- Подключение площадки вакансий и разрешение отправки являются отдельными согласиями.
- Оценка соответствия не является разрешением на отправку.
- Неподтверждённый факт блокирует затронутый комплект отклика.
- Отклик не отправляется без явного подтверждения пользователя.
- Не добавлять реальные резюме, персональные данные, токены или внешние credentials в fixtures и тесты.
- Каждый этап завершается отдельным тестовым циклом и коммитом.

## Review Focus

- Пустой профиль и профиль с разделами `not_applicable` должны различаться: первый блокирует поиск, второй может быть готовым.
- Конфликт дат/должностей должен блокировать готовность, но не скрывать исправляемые факты.
- Отключённый или просроченный OAuth-источник не должен удалять сохранённый поисковый профиль.
- Вакансия с неподтверждённым утверждением должна блокировать только свой комплект отклика.
- Повторное нажатие отправки и повторное открытие страницы не должны создавать второй отклик.

## Файловая структура

Создать отдельное приложение в `frontend/`, не смешивая его с Python-скриптами и документацией:

- `frontend/src/domain/profile.ts` — типы фактов профиля и состояния разделов.
- `frontend/src/domain/readiness.ts` — чистая проверка готовности профиля.
- `frontend/src/domain/search.ts` — поисковый профиль и чистая проверка его активации.
- `frontend/src/domain/application.ts` — комплект отклика, provenance, блокеры и идемпотентное состояние отправки.
- `frontend/src/services/contracts.ts` — интерфейсы адаптеров источников, профиля и откликов.
- `frontend/src/services/fixtures.ts` — безопасные локальные данные для разработки.
- `frontend/src/app/router.tsx` — маршруты и guards.
- `frontend/src/app/AppShell.tsx` — боковая навигация и глобальные индикаторы.
- `frontend/src/features/profile/` — редактор профиля и review извлечённых фактов.
- `frontend/src/features/sources/` — подключение источников.
- `frontend/src/features/search/` — поисковые профили.
- `frontend/src/features/jobs/` — очередь вакансий и страница вакансии.
- `frontend/src/features/applications/` — diff, provenance, блокеры и подтверждение отправки.
- `frontend/src/test/` — общие render helpers и fixture builders.

### Task 1: Frontend foundation and application shell

**Files:**
- Create: `frontend/package.json`, `frontend/tsconfig.json`, `frontend/vite.config.ts`, `frontend/index.html`
- Create: `frontend/src/main.tsx`, `frontend/src/app/router.tsx`, `frontend/src/app/AppShell.tsx`, `frontend/src/app/app.css`
- Create: `frontend/src/test/test-setup.ts`, `frontend/src/test/render.tsx`
- Test: `frontend/src/app/AppShell.test.tsx`

**Interfaces:**
- Produces routes `/profile`, `/profile/readiness`, `/sources`, `/search`, `/jobs`, `/applications`, `/settings`.
- Produces `AppShell` with navigation labels, profile/search/action indicators, and a routed content outlet.

- [ ] **Step 1: Write the failing shell test**

```tsx
it('renders the required navigation and global indicators', () => {
  renderApp('/profile')
  expect(screen.getByRole('link', { name: 'Профиль' })).toBeVisible()
  expect(screen.getByRole('link', { name: 'Вакансии' })).toBeVisible()
  expect(screen.getByText('Профиль не готов')).toBeVisible()
})
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `cd frontend && npm test -- AppShell.test.tsx`
Expected: FAIL because the application package and shell do not exist.

- [ ] **Step 3: Scaffold the minimal Vite application and shell**

Implement the routes and a semantic layout with `nav`, `main`, page title, and three placeholder global indicators. Keep visual styling in `app.css`; do not put domain decisions in components.

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `cd frontend && npm test -- AppShell.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend
git commit -m "feat: scaffold CV Maker web interface"
```

### Task 2: Profile domain model and readiness gate

**Files:**
- Create: `frontend/src/domain/profile.ts`, `frontend/src/domain/readiness.ts`
- Test: `frontend/src/domain/readiness.test.ts`

**Interfaces:**
- `type FactStatus = 'needs_input' | 'needs_review' | 'confirmed' | 'conflict' | 'not_applicable' | 'rejected'`.
- `type ProfileSection = 'basics' | 'employment' | 'projects' | 'skills' | 'education' | 'languages' | 'additional'`.
- `type ProfileReadiness = { ready: boolean; blockers: ReadinessBlocker[] }`.
- `function evaluateProfileReadiness(profile: ExperienceProfile): ProfileReadiness`.

- [ ] **Step 1: Write failing tests for the necessary-and-sufficient criterion**

```ts
it('blocks an empty profile')
it('accepts confirmed or not-applicable required sections')
it('blocks unresolved conflicts and mandatory questions')
it('requires provenance for every saved fact')
it('does not require optional additional data')
```

- [ ] **Step 2: Run tests and verify they fail**

Run: `cd frontend && npm test -- readiness.test.ts`
Expected: FAIL because the domain types and evaluator do not exist.

- [ ] **Step 3: Implement the pure types and evaluator**

The evaluator must return stable blocker codes such as `required_section`, `missing_provenance`, `conflict`, `mandatory_question`, and `not_reproducible`. It must not mutate the profile.

- [ ] **Step 4: Run tests and verify they pass**

Run: `cd frontend && npm test -- readiness.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/domain/profile.ts frontend/src/domain/readiness.ts frontend/src/domain/readiness.test.ts
git commit -m "feat: add profile readiness domain rules"
```

### Task 3: Profile editor and extracted-fact review

**Files:**
- Create: `frontend/src/services/contracts.ts`, `frontend/src/services/fixtures.ts`
- Create: `frontend/src/features/profile/ProfilePage.tsx`, `frontend/src/features/profile/ProfileSectionCard.tsx`, `frontend/src/features/profile/FactReviewList.tsx`
- Create: `frontend/src/features/profile/ProfilePage.test.tsx`
- Modify: `frontend/src/app/router.tsx`, `frontend/src/app/AppShell.tsx`

**Interfaces:**
- `ProfileService.load(): Promise<ExperienceProfile>`.
- `ProfileService.updateFact(input: UpdateFactInput): Promise<ExperienceProfile>`.
- `ProfileService.reviewFact(input: ReviewFactInput): Promise<ExperienceProfile>`.
- The page consumes `evaluateProfileReadiness` and exposes links to the first blocker.

- [ ] **Step 1: Write failing component tests**

```tsx
it('shows section statuses and the readiness blocker list')
it('offers confirm, edit, and reject actions for an extracted fact')
it('does not show the search CTA while the profile is blocked')
it('shows the search CTA only when readiness is true')
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `cd frontend && npm test -- ProfilePage.test.tsx`
Expected: FAIL because the profile route and components do not exist.

- [ ] **Step 3: Implement the fixture service and profile UI**

Use cards for the required sections. Render status text and actionable blockers. Confirming a fact updates the fixture-backed local state only; no generated text may silently alter the source fact.

- [ ] **Step 4: Run the tests and verify they pass**

Run: `cd frontend && npm test -- ProfilePage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/services frontend/src/features/profile frontend/src/app
git commit -m "feat: add profile editor and fact review"
```

### Task 4: Sources and searchable profile activation

**Files:**
- Create: `frontend/src/domain/search.ts`, `frontend/src/domain/search.test.ts`
- Create: `frontend/src/features/sources/SourcesPage.tsx`, `frontend/src/features/sources/SourceCard.tsx`, `frontend/src/features/search/SearchProfilesPage.tsx`, `frontend/src/features/search/SearchProfileForm.tsx`
- Create: `frontend/src/features/search/SearchProfilesPage.test.tsx`
- Modify: `frontend/src/services/contracts.ts`, `frontend/src/services/fixtures.ts`, `frontend/src/app/router.tsx`

**Interfaces:**
- `type SourceConnection = { id: string; status: SourceStatus; consent: ConsentState }`.
- `type SearchProfile = { id: string; roles: string[]; sources: string[]; scope: SearchScope; mode: SearchMode; active: boolean }`.
- `function validateSearchActivation(profile: SearchProfile, connections: SourceConnection[]): SearchActivationResult`.

- [ ] **Step 1: Write failing tests**

```ts
it('requires a source, role or query, search scope, and processing mode')
it('keeps a saved search profile when one source is disconnected')
it('does not activate a profile with a revoked consent')
```

- [ ] **Step 2: Run and verify failure**

Run: `cd frontend && npm test -- search.test.ts SearchProfilesPage.test.tsx`
Expected: FAIL because the activation rule and screens do not exist.

- [ ] **Step 3: Implement pure validation and source/search screens**

Render source consent and token status separately from application login. Show the human-readable launch summary before activation. Keep advanced filters collapsed by default.

- [ ] **Step 4: Run and verify pass**

Run: `cd frontend && npm test -- search.test.ts SearchProfilesPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/domain/search* frontend/src/features/sources frontend/src/features/search frontend/src/services frontend/src/app/router.tsx
git commit -m "feat: add sources and search profile activation"
```

### Task 5: Vacancy queue and explainable matching

**Files:**
- Create: `frontend/src/features/jobs/JobsPage.tsx`, `frontend/src/features/jobs/JobDetailsPage.tsx`, `frontend/src/features/jobs/MatchExplanation.tsx`
- Create: `frontend/src/features/jobs/JobsPage.test.tsx`
- Modify: `frontend/src/services/contracts.ts`, `frontend/src/services/fixtures.ts`, `frontend/src/app/router.tsx`

**Interfaces:**
- `JobService.list(): Promise<JobSummary[]>`.
- `JobService.get(id: string): Promise<JobDetails>`.
- `JobDetails` exposes required skills, confirmed matches, gaps, source, date, score, and lifecycle status.

- [ ] **Step 1: Write failing tests**

```tsx
it('renders status, source, date, score, and explanation for each vacancy')
it('shows confirmed matches and gaps on the vacancy page')
it('offers prepare-application only for a selected vacancy')
```

- [ ] **Step 2: Run and verify failure**

Run: `cd frontend && npm test -- JobsPage.test.tsx`
Expected: FAIL because job routes and components do not exist.

- [ ] **Step 3: Implement queue, detail view, and fixture adapter**

Make score secondary to the explanation. Keep the source vacancy text visibly separate from user/profile facts and treat it as untrusted display data.

- [ ] **Step 4: Run and verify pass**

Run: `cd frontend && npm test -- JobsPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/jobs frontend/src/services frontend/src/app/router.tsx
git commit -m "feat: add vacancy queue and matching explanation"
```

### Task 6: Application package, provenance, diff, and explicit send gate

**Files:**
- Create: `frontend/src/domain/application.ts`, `frontend/src/domain/application.test.ts`
- Create: `frontend/src/features/applications/ApplicationReviewPage.tsx`, `frontend/src/features/applications/DocumentDiff.tsx`, `frontend/src/features/applications/ProvenanceList.tsx`, `frontend/src/features/applications/SendConfirmation.tsx`
- Create: `frontend/src/features/applications/ApplicationReviewPage.test.tsx`
- Modify: `frontend/src/services/contracts.ts`, `frontend/src/services/fixtures.ts`, `frontend/src/app/router.tsx`

**Interfaces:**
- `type ApplicationPackage = { id: string; jobId: string; documents: GeneratedDocument[]; warnings: Warning[]; blockers: ApplicationBlocker[]; sendState: SendState }`.
- `function canSendApplication(pkg: ApplicationPackage): boolean`.
- `ApplicationService.prepare(jobId: string): Promise<ApplicationPackage>`.
- `ApplicationService.confirmContent(id: string): Promise<ApplicationPackage>`.
- `ApplicationService.send(id: string, idempotencyKey: string): Promise<SendResult>`.

- [ ] **Step 1: Write failing domain and component tests**

```ts
it('blocks sending when any used fact is unconfirmed')
it('requires content confirmation before send confirmation')
it('shows diff, warnings, and fact provenance')
it('returns the same result for repeated send calls with one idempotency key')
```

- [ ] **Step 2: Run and verify failure**

Run: `cd frontend && npm test -- application.test.ts ApplicationReviewPage.test.tsx`
Expected: FAIL because the application domain and review screen do not exist.

- [ ] **Step 3: Implement the package domain and review UI**

Render the adapted resume, letter, match explanation, used facts, warnings, and diff. Disable the final send control until content confirmation succeeds and `canSendApplication` returns true. The fixture adapter must model idempotency without external network calls.

- [ ] **Step 4: Run and verify pass**

Run: `cd frontend && npm test -- application.test.ts ApplicationReviewPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/domain/application* frontend/src/features/applications frontend/src/services frontend/src/app/router.tsx
git commit -m "feat: add application review and send gate"
```

### Task 7: Critical end-to-end flow and accessibility checks

**Files:**
- Create: `frontend/e2e/profile-to-application.spec.ts`
- Create: `frontend/src/app/AppShell.a11y.test.tsx`
- Modify: `frontend/package.json`, `frontend/playwright.config.ts`
- Modify: `docs/progress.md`, `docs/requirements/traceability.md`

**Interfaces:**
- The E2E fixture starts with a blocked profile and drives the user through fixture-backed profile review, source selection, search activation, vacancy selection, application review, and explicit send confirmation.

- [ ] **Step 1: Write the failing E2E scenario**

```ts
test('moves from profile readiness to an explicitly confirmed application', async ({ page }) => {
  await page.goto('/profile')
  await expect(page.getByText('Профиль не готов')).toBeVisible()
  await page.getByRole('button', { name: 'Подтвердить' }).click()
  await page.getByRole('link', { name: 'Настроить поиск' }).click()
  await page.getByRole('button', { name: 'Запустить поиск' }).click()
  await page.getByRole('link', { name: /Подготовить отклик/ }).click()
  await expect(page.getByRole('button', { name: 'Подтвердить и отправить' })).toBeDisabled()
})
```

- [ ] **Step 2: Run and verify failure**

Run: `cd frontend && npx playwright test e2e/profile-to-application.spec.ts`
Expected: FAIL until all routes and guards are wired together.

- [ ] **Step 3: Add the critical flow and accessibility assertions**

Assert keyboard-reachable navigation, visible focus, labelled form controls, disabled send state, and the exact blocked-to-ready transitions. Do not assert implementation-specific CSS details.

- [ ] **Step 4: Run the full frontend verification**

Run: `cd frontend && npm test`
Expected: PASS for unit/component tests.

Run: `cd frontend && npx playwright test`
Expected: PASS for the fixture-backed critical flow.

Run from the repository root: `& 'C:\\Users\\user\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe' scripts/check_docs.py`.
Expected: `Documentation check OK`.

- [ ] **Step 5: Update traceability and commit**

Replace `Не создано` / `Не выполнена` for REQ-027–REQ-034 with real implementation and test references only after the tests pass.

```bash
git add frontend docs/progress.md docs/requirements/traceability.md
git commit -m "test: verify CV Maker interface flow"
```

## Plan Self-Review

- **Spec coverage:** profile sections and readiness are covered by Tasks 2–3; source consent and search activation by Task 4; vacancy matching by Task 5; diff, provenance, explicit confirmation, and idempotency by Task 6; global navigation and indicators by Task 1; end-to-end sequencing and accessibility by Task 7.
- **Open dependencies:** backend API contracts and the exact supported job platforms remain outside this frontend fixture plan and continue to be governed by Q-001–Q-007.
- **No placeholders:** no task depends on an unspecified function, route, or test command; fixture adapters are explicit until API contracts exist.
- **Type consistency:** domain functions are pure and consumed by the corresponding feature pages; service methods are named in `contracts.ts` before their feature tasks use them.
- **Review focus coverage:** each listed failure mode has a test in Tasks 2, 4, 6, and 7.
