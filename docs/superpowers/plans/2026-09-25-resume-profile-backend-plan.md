---
id: PLAN-002
status: approved
version: 1.2
owner: Backend-разработчик (роль; персональное назначение отсутствует)
approved_by: Пользователь подтвердил выполнение редакции 1.2 сообщением «ОК» 2026-09-25; реализация начата в отдельной ветке
last_reviewed: 2026-09-25
scope: Поэтапная реализация SPEC-005 в backend API и подключённом frontend
---

# Backend профилей резюме — план реализации

> **Для исполнителя:** перед началом реализации применить `superpowers:subagent-driven-development` (рекомендуется) либо `superpowers:executing-plans`. Выполнять задачи по одной; шаги отмечаются чекбоксами.

**Цель:** Подогнать существующую реализацию backend и frontend под SPEC-005 1.3: явное создание черновика, текстовый блок опыта, мягкое удаление и понятный отказ импорта.

**Архитектура:** Существующие FastAPI/SQLAlchemy API и React frontend корректируются в рамках их текущих границ. Новый черновик создаётся отдельной командой или загрузкой файла; введённый текст добавляется блоком `experience` к существующему черновику. Ошибка извлечения возвращается интерфейсу и не создаёт черновик. Удаление профиля, факта или черновика только выставляет tombstone-поля; история и связи сохраняются.

**Стек:** Python 3.12+, FastAPI, Pydantic, SQLAlchemy, Alembic, PostgreSQL, pytest, HTTPX TestClient; `python-multipart` для multipart upload. Библиотеки PDF/DOCX выбираются после проверки официальной документации перед реализацией файлового импорта. Unit/API tests используют временную SQLite базу; миграции дополнительно проверяются на PostgreSQL до релиза.

**Спецификация:** [SPEC-005 — Дизайн backend профилей резюме](../specs/2026-09-25-resume-profile-backend-design.md)

## Глобальные ограничения

- Разбор выполняется без LLM.
- Новый черновик создаётся только отдельной командой пользователя или импортом файла; добавление текста не создаёт новый черновик.
- Текст пользователя добавляется отдельным редактируемым блоком опыта существующего черновика.
- При ошибке чтения/распознавания файла API возвращает понятную ошибку, черновик не создаётся и файл не сохраняется.
- Удаление — только `is_deleted=true` и `deleted_at`; физическая очистка не выполняется, история и связи сохраняются.
- Черновик явно переводится в `reviewed`, выходит из очереди проверки, но сохраняется до мягкого удаления; TTL нет.
- Каждый импорт файла создаёт новый черновик, без дедупликации.
- Не добавлять OCR, старый DOC, авторизацию, рыночный анализ или генерацию документов.

## Review Focus

- Пустой текстовый черновик создаётся отдельной командой и после перезагрузки читается; покрыть API-тестом.
- Текстовый блок добавляется существующему черновику с `kind=experience` и следующим ordinal, не создавая второй draft; покрыть API-тестом.
- Ошибка для повреждённого/неподдерживаемого файла видна пользователю и не оставляет draft; покрыть API и UI тестами.
- Soft-delete скрывает ресурс при GET/list, сохраняет связанные версии/связи и не позволяет включить удалённый факт в профиль; покрыть storage/API тестами.
- Повторный одинаковый импорт создаёт два draft; reviewed исключается из очереди, но сохраняется; покрыть API тестами.

---

## Обновлённая структура файлов для оставшихся задач

- `backend/src/cv_backend/storage/models/draft.py` — состояние reviewed и поля мягкого удаления черновиков.
- `backend/src/cv_backend/storage/models/candidate.py` — tombstone-поля элементов базы кандидата.
- `backend/src/cv_backend/storage/models/profile.py` — tombstone-поля профилей.
- `backend/src/cv_backend/storage/repositories/drafts.py` — создание пустого draft, добавление experience block, фильтры удаления и очередь.
- `backend/src/cv_backend/storage/repositories/candidate.py` — soft-delete и фильтрация элементов.
- `backend/src/cv_backend/storage/repositories/profiles.py` — soft-delete и фильтрация профилей/выборок.
- `backend/src/cv_backend/api/routes/resume_drafts.py` — POST create, add experience block, review, DELETE и ошибки upload.
- `backend/src/cv_backend/api/routes/profiles.py` и route общей базы — семантика soft-delete.
- `backend/alembic/versions/` — миграция для полей и enum/check изменения, если требуется для актуальной поддерживаемой схемы.
- `frontend/src/services/resume-profiles.ts` — методы createDraft/addExperienceBlock и извлечение detail ошибки API.
- `frontend/src/features/resumeProfiles/ResumeProfilesPage.tsx` — кнопка создания черновика, добавление блока к выбранному draft, текст ошибки upload.
- Тесты в `backend/tests/api/`, `backend/tests/storage/`, `frontend/src/services/resume-profiles.test.ts` и `frontend/src/features/resumeProfiles/ResumeProfilesPage.test.tsx`.

---

## Ограничения первоначального объёма

- Первоначальные Tasks 1–7 ниже описывают уже выполненный базовый этап; устаревшие требования по созданию черновика из произвольного текста и обработке временных байтов заменяются Task 8.
- Сохраняются все инварианты SPEC-005: нет LLM, факты/профили изменяются только по явной команде, пользовательские файлы и реальные данные не помещаются в тесты/логи/репозиторий.
- Q-007 и Q-009 решены для этого MVP согласно ADR-002; Q-008 отложен — OCR и `.doc` не реализовывать. Это не блокирует PDF с текстовым слоем или DOCX.
- Не реализовывать авторизацию через Яндекс/VK, вакансии, рыночный анализ, генерацию документов или отправку откликов.
- Сохранить ограничение загрузки 20 MiB и существующие SQLite тесты; не добавлять требования по самостоятельной очистке временных байтов.

## Особое внимание при проверке

- Повреждённый или неподдерживаемый документ: запрос завершается понятной ошибкой без создания черновика; сообщение видно в интерфейсе.
- Текст опыта: добавляется только в уже выбранный черновик как отдельный `experience` block.
- Удалённые сущности не возвращаются обычным GET/list, а их история и связи остаются сохранёнными.
- Повторная загрузка одинакового файла создаёт независимый новый черновик; автоматического объединения нет.
- Явная проверка убирает черновик из очереди, но не удаляет его и не запускает TTL.

## Структура файлов

Создать backend как самостоятельный Python-пакет, не размещая код в `scripts/`:

- `backend/pyproject.toml` — runtime и dev-зависимости, конфигурация pytest и форматтера.
- `backend/.gitignore` — исключить `.venv/`, `__pycache__/`, `.pytest_cache/` и локальные секреты.
- `docs/operations/backend.md` — установка, конфигурация, миграции, запуск и тестирование backend.
- `backend/src/cv_backend/app.py` — создание FastAPI приложения и подключение роутеров.
- `backend/src/cv_backend/api/dependencies.py` — подключаемые зависимости пользователя и сервисов.
- `backend/src/cv_backend/api/routes/resume_drafts.py` — создание и редактирование черновиков, применение выбранного блока.
- `backend/src/cv_backend/api/routes/candidate_base.py` — чтение и явное редактирование общей базы.
- `backend/src/cv_backend/api/routes/profiles.py` — CRUD профилей и их выборок.
- `backend/src/cv_backend/domain/drafts.py` — типы черновика и блока и допустимые переходы.
- `backend/src/cv_backend/domain/candidate.py` — типы фактов, опыта, проекта, навыка, инструмента, образования и языка.
- `backend/src/cv_backend/domain/profiles.py` — профиль, целевые роли, условия поиска, выборки и порядок секций.
- `backend/src/cv_backend/services/text_parser.py` — разбор текста по поддерживаемым заголовкам с сохранением непрочитанных блоков.
- `backend/src/cv_backend/services/document_extractor.py` — извлечение текста из разрешённых форматов.
- `backend/src/cv_backend/services/draft_service.py` — создание, редактирование, применение и удаление черновиков.
- `backend/src/cv_backend/services/profile_service.py` — пользовательские изменения базы, CRUD профиля, выбор фактов/навыков/инструментов.
- `backend/src/cv_backend/storage/` — SQLAlchemy models, сессия и репозитории.
- `backend/alembic/` — окружение и версии миграций схемы.
- `backend/tests/unit/` — чистые тесты парсера и доменных переходов.
- `backend/tests/api/` — API-тесты с изолированной тестовой БД и подменой аутентифицированного пользователя.
- `backend/tests/fixtures/` — синтетические минимальные PDF/DOCX без пользовательских данных.
- `docs/architecture/` либо `docs/superpowers/specs/` — только необходимые уточнения модели и эксплуатации; обновить реестр и traceability.

### Task 1: Основа backend и тестового окружения

**Файлы:**

- Создать: `backend/pyproject.toml`, `backend/.gitignore`, `backend/src/cv_backend/__init__.py`, `backend/src/cv_backend/app.py`
- Создать: `backend/src/cv_backend/api/dependencies.py`, `backend/src/cv_backend/api/__init__.py`
- Создать: `backend/tests/conftest.py`, `backend/tests/api/test_health.py`, `docs/operations/backend.md`
- Изменить: `docs/README.md`, `docs/progress.md`

**Интерфейсы:**

- Создать `create_app() -> FastAPI`.
- Предоставить `get_current_user_id() -> UUID` как заменяемую FastAPI dependency; production provider не реализовывать.
- Предоставить `/health` с ответом `{"status": "ok"}` без персональных данных.

- [x] **Шаг 1: написать падающий smoke-тест приложения**

```python
from fastapi.testclient import TestClient
from cv_backend.app import create_app

def test_health_returns_ok():
    response = TestClient(create_app()).get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

- [x] **Шаг 2: установить только тестовый инструмент и необходимые библиотеки**

Создать изолированное окружение и установить минимальный тестовый стек: `Set-Location backend; python -m venv .venv; & .\.venv\Scripts\python.exe -m pip install pytest fastapi httpx`. Не устанавливать пакеты глобально.

- [x] **Шаг 3: убедиться, что тест падает до реализации**

Запуск: `Set-Location backend; & .\.venv\Scripts\python.exe -m pytest tests/api/test_health.py -q`
Ожидание: импорт `cv_backend` завершается ошибкой, так как пакет приложения ещё отсутствует.

- [x] **Шаг 4: создать минимальный пакет и API-приложение**

В `pyproject.toml` объявить Python 3.12+, FastAPI, Pydantic, SQLAlchemy, Alembic и pytest/HTTPX для разработки. Выполнить `Set-Location backend; & .\.venv\Scripts\python.exe -m pip install -e ".[dev]"`. В `app.py` создать приложение и маршрут `/health`. В `conftest.py` задать временную SQLite базу и подмену `get_current_user_id` через FastAPI dependency overrides; не добавлять реального OAuth.

- [x] **Шаг 5: проверить smoke-тест и импорт пакета**

Запуск: `Set-Location backend; & .\.venv\Scripts\python.exe -m pytest tests/api/test_health.py -q`
Ожидание: PASS.

- [x] **Шаг 6: обновить документацию запуска и зафиксировать этап**

Добавить в `docs/operations/backend.md` реквизиты DOC-006 и инструкции установки dev-зависимостей, миграций, тестов и локального старта API. Зарегистрировать DOC-006 в `docs/README.md`; отразить начало backend в `docs/progress.md`. Выполнить `python scripts/check_docs.py` из корня.

- [x] **Шаг 7: зафиксировать основу backend**

```powershell
git add backend docs/README.md docs/progress.md docs/operations/backend.md
git commit -m "feat: scaffold resume profile backend"
```

### Task 2: Детерминированный разбор текста в черновые блоки

**Файлы:**

- Создать: `backend/src/cv_backend/domain/drafts.py`, `backend/src/cv_backend/services/text_parser.py`
- Создать: `backend/tests/unit/test_text_parser.py`

**Интерфейсы:**

- `DraftBlockInput` — immutable typed object `{ kind: DraftBlockKind, heading: str | None, text: str, ordinal: int }`.
- `DraftBlockKind` — `Literal["basics", "preferences", "experience", "projects", "skills", "tools", "education", "certifications", "languages", "additional", "unparsed"]`.
- `parse_resume_text(text: str) -> list[DraftBlockInput]` — чистая функция, без сети, файловой системы и LLM.
- `kind` принимает только перечисленные типы: `basics`, `preferences`, `experience`, `projects`, `skills`, `tools`, `education`, `certifications`, `languages`, `additional`, `unparsed`.

- [x] **Шаг 1: написать тесты на секции и сохранение неизвестного текста**

```python
from cv_backend.services.text_parser import parse_resume_text

def test_parser_keeps_unrecognized_text_and_separates_skills_from_tools():
    blocks = parse_resume_text(
        "Навыки\nУправление командой\nИнструменты\nJira, Docker\n"
        "Нестандартный раздел\nОсобый текст"
    )
    assert [(b.kind, b.text) for b in blocks] == [
        ("skills", "Управление командой"),
        ("tools", "Jira, Docker"),
        ("unparsed", "Нестандартный раздел\nОсобый текст"),
    ]

def test_parser_rejects_empty_input():
    assert parse_resume_text(" \n\t") == []
```

- [x] **Шаг 2: выполнить тест до реализации**

Запуск: `Set-Location backend; & .\.venv\Scripts\python.exe -m pytest tests/unit/test_text_parser.py -q`
Ожидание: FAIL, модуль парсера отсутствует.

- [x] **Шаг 3: реализовать правила заголовков и блок `unparsed`**

Использовать таблицу явных русских и английских заголовков с нормализацией регистра, пробелов и завершающего двоеточия (например, `Инструменты:`). Сохранять текст каждого блока дословно, исходный порядок и неизвестные разделы. Не выводить факты, роли или навыки из свободного текста. Пустой вход возвращает пустой список. Представить `DraftBlockInput` как frozen dataclass, чтобы поля из интерфейса соответствовали тестам `block.kind` и `block.text`.

- [x] **Шаг 4: проверить тесты парсера и граничные входы**

Запуск: `Set-Location backend; & .\.venv\Scripts\python.exe -m pytest tests/unit/test_text_parser.py -q`
Ожидание: PASS для пустого ввода, повторяющихся заголовков, CRLF/LF, неизвестных разделов и разделения навыков/инструментов.

- [x] **Шаг 5: зафиксировать этап**

```powershell
git add backend/src/cv_backend/domain/drafts.py backend/src/cv_backend/services/text_parser.py backend/tests/unit/test_text_parser.py
git commit -m "feat: parse resume text into editable draft blocks"
```

### Task 3: Схема хранения черновиков и общей базы кандидата

**Решение для оставшихся миграций:** Q-007 закрыт для MVP мягким удалением; новые миграционные изменения и тесты входят в Task 8. Не менять смысл фактов из SPEC-003/Q-004/Q-005.

**Файлы:**

- Создать: `backend/src/cv_backend/domain/candidate.py`
- Создать: `backend/src/cv_backend/storage/database.py`, `backend/src/cv_backend/storage/models/draft.py`, `backend/src/cv_backend/storage/models/candidate.py`
- Создать: `backend/src/cv_backend/storage/repositories/drafts.py`, `backend/src/cv_backend/storage/repositories/candidate.py`
- Создать: `backend/src/cv_backend/services/draft_service.py`
- Создать: `backend/tests/storage/test_draft_repository.py`, `backend/tests/storage/test_candidate_repository.py`
- Изменить после решения вопросов: `docs/architecture/experience.md`, `docs/requirements/traceability.md`, `docs/governance/open-questions.md`

**Интерфейсы:**

- `DraftRepository.create(owner_id: UUID, blocks: list[DraftBlockInput]) -> ResumeDraft`.
- `DraftRepository.get(owner_id: UUID, draft_id: UUID) -> ResumeDraft | None`.
- `DraftService.apply_block(owner_id: UUID, draft_id: UUID, block_id: UUID, items: list[CandidateItemInput], idempotency_key: str) -> list[CandidateItem]`; `items` are explicitly entered/confirmed by the user, never inferred from free text. Repeated calls with the same key return the same items.
- `CandidateItemInput` содержит тип факта и валидированные типизированные поля для опыта, проекта, навыка, инструмента, образования, сертификата, языка или контакта; произвольный payload без схемы запрещён.
- `CandidateRepository.add_items(owner_id: UUID, items: list[CandidateItemInput]) -> list[CandidateItem]`.
- `CandidateRepository.update_item(owner_id: UUID, item_id: UUID, patch: CandidateItemPatch) -> CandidateItem`; обновляет только поля, присланные пользователем, и не меняет профильные переопределения.
- Каждая запись имеет владельца; репозиторий всегда требует `owner_id` в запросах на чтение/изменение.

- [x] **Шаг 1: написать repository-тесты с изолированной тестовой БД**

Проверить на временной SQLite базе, что черновик и блоки восстанавливаются после новой сессии, запись другого владельца не возвращается, а применение одинакового idempotency key не создаёт дубликат.

- [x] **Шаг 2: выполнить тесты до реализации**

Запуск: `Set-Location backend; & .\.venv\Scripts\python.exe -m pytest tests/storage/test_draft_repository.py tests/storage/test_candidate_repository.py -q`
Ожидание: FAIL, модели и репозитории отсутствуют.

- [x] **Шаг 3: реализовать ORM-модели; миграцию оставить отдельным этапом**

Определить ORM-таблицы черновиков и упорядоченных блоков, candidate items с типом и связями на проекты, навыки и инструменты. Хранить текст разобранного блока в черновике. Не создавать таблицу или объект для исходного файла. Применение блоков выполняется транзакционно и только явной командой. Постоянные Alembic migrations в базовом этапе не создавались; это входит в Task 8.

- [x] **Шаг 4: проверить изоляцию, транзакцию и SQLite-поведение**

Запуск: `Set-Location backend; & .\.venv\Scripts\python.exe -m pytest tests/storage -q`
Ожидание: PASS; временная SQLite схема создаётся через SQLAlchemy metadata. Проверка Alembic upgrade/downgrade входит в Task 8.

- [x] **Шаг 5: зафиксировать модель данных**

Первоначальный этап проверял ORM через SQLite; миграции для soft-delete и нового
состояния черновика добавляются в Task 8. Физическая очистка и резервные копии
не входят в согласованный объём.

Зафиксировать код миграции и согласованные документы отдельным commit после проверки diff.

### Task 4: Независимые специализационные профили и выборки

**Файлы:**

- Изменить: `backend/src/cv_backend/domain/candidate.py`
- Создать: `backend/src/cv_backend/domain/profiles.py`
- Создать: `backend/src/cv_backend/storage/models/profile.py`, `backend/src/cv_backend/storage/repositories/profiles.py`
- Создать: `backend/alembic/versions/add_specialization_profiles.py`
- Создать: `backend/src/cv_backend/services/profile_service.py`
- Создать: `backend/tests/unit/test_profile_service.py`, `backend/tests/storage/test_profile_repository.py`

**Интерфейсы:**

- `ProfileService.create(owner_id: UUID, data: ProfileCreate) -> SpecializationProfile`.
- `ProfileService.get(owner_id: UUID, profile_id: UUID) -> SpecializationProfile | None`.
- `ProfileService.update(owner_id: UUID, profile_id: UUID, patch: ProfilePatch) -> SpecializationProfile`.
- `ProfileService.set_selections(owner_id: UUID, profile_id: UUID, selections: ProfileSelections) -> SpecializationProfile`.
- `ProfileCreate` включает `name`; `ProfilePatch` допускает частичное изменение `name`, `target_roles`, `search_preferences`, `headline`, `summary`, `section_order` и `text_overrides`.
- `ProfileSelections` содержит отдельные упорядоченные списки `candidate_item_ids: list[UUID]`, `skill_ids: list[UUID]` и `tool_ids: list[UUID]`.

- [x] **Шаг 1: написать изоляционные тесты для двух профилей**

```python
def test_editing_one_profile_does_not_change_another(profile_service, owner_id):
    ai = profile_service.create(owner_id, ProfileCreate(name="AI Engineer"))
    qa = profile_service.create(owner_id, ProfileCreate(name="QA Engineer"))
    profile_service.update(owner_id, ai.id, ProfilePatch(headline="AI Engineer"))
    assert profile_service.get(owner_id, qa.id).headline is None

def test_profile_selects_skills_and_tools_separately(profile_service, owner_id, base_items):
    profile = profile_service.create(owner_id, ProfileCreate(name="QA Engineer"))
    saved = profile_service.set_selections(
        owner_id, profile.id,
        ProfileSelections(skill_ids=[base_items.skill_id], tool_ids=[base_items.tool_id]),
    )
    assert saved.skill_ids == [base_items.skill_id]
    assert saved.tool_ids == [base_items.tool_id]

def test_editing_base_item_does_not_overwrite_profile_text(profile_service, candidate_repository, owner_id, base_items):
    profile = profile_service.create(owner_id, ProfileCreate(name="QA Engineer"))
    profile_service.set_selections(
        owner_id, profile.id, ProfileSelections(candidate_item_ids=[base_items.experience_id])
    )
    profile_service.update(owner_id, profile.id, ProfilePatch(
        text_overrides={base_items.experience_id: "QA leadership"}
    ))
    candidate_repository.update_item(
        owner_id, base_items.experience_id, CandidateItemPatch(text="Updated fact")
    )
    refreshed = profile_service.get(owner_id, profile.id)
    assert refreshed.text_overrides[base_items.experience_id] == "QA leadership"
```

- [x] **Шаг 2: подтвердить, что тесты ловят отсутствующую независимость**

Запуск: `Set-Location backend; & .\.venv\Scripts\python.exe -m pytest tests/unit/test_profile_service.py -q`
Ожидание: FAIL до реализации `ProfileService`.

- [x] **Шаг 3: реализовать CRUD и профильные связи**

Хранить названия, целевые должности, условия поиска, заголовок, описание и пользовательские формулировки в профиле. Хранить выбор и порядок общих записей, навыков, инструментов и разделов как профильные связи. Запросы с чужими или неподтверждёнными item IDs отклонять целиком, не сохранять частичный набор. Миграция полей удаления для профилей входит в Task 8.

- [x] **Шаг 4: проверить независимость и пользовательские изменения**

Запуск: `Set-Location backend; & .\.venv\Scripts\python.exe -m pytest tests/unit/test_profile_service.py tests/storage/test_profile_repository.py -q`
Ожидание: PASS для двух профилей, независимого порядка, выбранных навыков/инструментов, удаления профиля без удаления базы и запрета владельцу менять чужой профиль.

- [ ] **Шаг 5: зафиксировать этап**

```powershell
git add backend/src/cv_backend/domain backend/src/cv_backend/storage backend/src/cv_backend/services/profile_service.py backend/tests
git commit -m "feat: add independent resume specialization profiles"
```

### Task 5: Извлечение текста из PDF/DOCX

OCR и `.doc` остаются вне объёма согласно SPEC-005 §9; поддерживаются PDF с текстовым слоем и DOCX.

**Файлы:**

- Создать: `backend/src/cv_backend/services/document_extractor.py`
- Создать: `backend/tests/unit/test_document_extractor.py`
- Создать после выбора библиотек: малые синтетические fixtures в `backend/tests/fixtures/`

**Интерфейсы:**

- `extract_document_text(filename: str, content: bytes) -> str`.

- [x] **Шаг 1: сверить официальные документы библиотек PDF/DOCX**

Перед установкой зависимостей определить поддерживаемую Python-версию, API извлечения текста и известные ограничения выбранных библиотек. Записать URL, дату проверки и ограничения в ADR/архитектурную заметку.

- [x] **Шаг 2: написать тесты извлечения и валидации**

Проверить валидный PDF и DOCX, пустой PDF без текстового слоя и повреждённый/неподдерживаемый файл. Для неуспешного импорта endpoint возвращает ошибку и не создаёт черновик.

- [x] **Шаг 3: выполнить тесты до реализации**

Запуск: `Set-Location backend; & .\.venv\Scripts\python.exe -m pytest tests/unit/test_document_extractor.py -q`
Ожидание: FAIL, функции извлечения отсутствуют.

- [x] **Шаг 4: реализовать извлечение текста без сохранения исходного файла**

Ограничить загрузку `MAX_UPLOAD_BYTES=20 MiB`, проверять фактическую PDF/ZIP сигнатуру и не доверять MIME отдельно. Защитить DOCX от чрезмерного распакованного объёма. При ошибке извлечения вернуть ошибку; не создавать пустой draft и не сохранять исходный файл. OCR и `.doc` не реализовывать.

- [x] **Шаг 5: проверить библиотечные fixtures и повторно выполнить тесты**

Запуск: `Set-Location backend; & .\.venv\Scripts\python.exe -m pytest tests/unit/test_document_extractor.py -q`
Ожидание: PASS для поддерживаемых файлов; отказные случаи не создают черновик и дают проверяемую ошибку.

### Task 6: API черновиков, общей базы, профилей и frontend-подключение

**Файлы:**

- Создать: `backend/src/cv_backend/api/routes/resume_drafts.py`, `backend/src/cv_backend/api/routes/candidate_base.py`, `backend/src/cv_backend/api/routes/profiles.py`
- Создать: `backend/tests/api/test_resume_drafts.py`, `backend/tests/api/test_candidate_base.py`, `backend/tests/api/test_profiles.py`
- Изменить: `backend/src/cv_backend/app.py`, `backend/src/cv_backend/api/dependencies.py`
- Создать: frontend API-клиент, его тесты, страницу управления специализационными профилями и её тесты.
- Изменить: `frontend/src/app/router.tsx`, `frontend/src/app/AppShell.tsx`; продуктивный путь профилей работает через backend, fixtures остаются только в тестах.

**Интерфейсы:**

- Реализовать маршруты из SPEC-005 §5 без изменения их семантики.
- Ошибки валидации возвращают структурированные `422`; неподдерживаемый тип — `415`, превышение размера — `413`, повреждённый или нечитаемый документ — `422`; чужой ресурс — `404`.
- Ответ импорта содержит `draft_id`, список блоков и состояние `needs_user_review`.
- Для локальной интеграции без OAuth использовать только явно включаемую dev identity; она недоступна в production.

- [x] **Шаг 1: написать API-тесты с подменёнными account IDs и тесты frontend API-клиента**

```python
def test_user_cannot_read_another_users_draft(client_factory, draft_factory):
    draft = draft_factory(owner_id="user-a")
    client = client_factory(user_id="user-b")
    response = client.get(f"/api/v1/resume-drafts/{draft.id}")
    assert response.status_code == 404

def test_import_only_creates_draft_until_user_applies_block(client, db_session):
    response = client.post(
        "/api/v1/resume-drafts/text",
        json={"text": "Навыки\\nУправление командой"},
    )
    assert response.status_code == 201
    assert db_session.query(CandidateItemModel).count() == 0
    assert response.json()["state"] == "needs_user_review"
```

- [x] **Шаг 2: выполнить API-тесты до реализации маршрутов**

Запуск: `Set-Location backend; & .\.venv\Scripts\python.exe -m pytest tests/api/test_resume_drafts.py tests/api/test_candidate_base.py tests/api/test_profiles.py -q`
Ожидание: FAIL с 404 или отсутствующими импортами до подключения роутеров.

- [x] **Шаг 3: подключить пользовательские команды и коды ошибок**

Подключить тестовую dependency пользователя и сервисы. Импорт создаёт только черновик. Блок применяет пользовательская команда, затем сервис сохраняет подтверждённые данные в общей базе; пользователь отдельно выбирает их в профиле. PATCH изменяет только указанные поля. Все записи проверяются на владельца в одной транзакции.

- [x] **Шаг 4: проверить API, транзакции и ошибки**

Запуск: `Set-Location backend; & .\.venv\Scripts\python.exe -m pytest tests/api -q`
Ожидание: PASS для CRUD, изоляции пользователей, отсутствия побочных изменений при импорте, повтора команды, ошибок файлов и атомарности профильных выборок. Frontend подтверждает запросы к API и отображение ответа без fixture-источника в продуктовом пути.

- [ ] **Шаг 5: зафиксировать этап**

```powershell
git add backend/src/cv_backend/api backend/tests/api
git commit -m "feat: expose resume profile backend API"
```

### Task 7: Сквозная проверка, инструкции и трассировка

**Файлы:**

- Создать: `backend/tests/api/test_profile_creation_flow.py`
- Изменить: `backend/README.md`, `docs/progress.md`, `docs/requirements/traceability.md`, `docs/README.md`

- [x] **Шаг 1: написать сквозной сценарий на синтетических данных**

Проверить путь: текстовый импорт → сохраняемый черновик → редактирование одного блока → явное typed-включение в общую базу → создание профилей AI и QA → раздельный выбор skill/tool → изменение AI-профиля без изменения QA. Повторный импорт и разрешение дубликатов отложены; автоматическое объединение не выполняется.

- [x] **Шаг 2: выполнить сценарий и исправить расхождения**

Запуск: `Set-Location backend; & .\.venv\Scripts\python.exe -m pytest tests/api/test_profile_creation_flow.py -q`
Ожидание: PASS; в сценарии ни одна запись не появляется в постоянной базе до команды пользователя.

- [x] **Шаг 3: обновить команды локального запуска и регистрации требований**

В `docs/operations/backend.md` описать настройку тестовой БД, миграции, запуск API и тестов. В traceability заменить статусы только для тех REQ-038–REQ-045, которые реально покрыты тестами, ссылаясь на конкретные файлы. В progress указать оставшиеся gate или ограничения OCR/retention.

- [x] **Шаг 4: запустить проверки перед завершением реализации**

Запуски:

```powershell
Set-Location backend; & .\.venv\Scripts\python.exe -m pytest
Set-Location ..; python scripts/check_docs.py
git diff --check
```

Ожидание: backend suite и документационная проверка успешны; тесты не используют реальные персональные данные или загруженные пользователем файлы.

- [ ] **Шаг 5: выполнить обзор и коммит**

Проверить staged diff на незапрошенные интеграции, автоматические изменения данных, исходные файлы в постоянном хранилище и чувствительные тестовые данные. Сохранить итоговые связи в traceability и зафиксировать сквозной этап отдельным коммитом.

### Task 8: Мягкое удаление, очередь проверки и явное создание черновика

**Файлы:**

- Изменить: `backend/src/cv_backend/storage/models/draft.py`, `candidate.py`, `profile.py`.
- Изменить: `backend/src/cv_backend/storage/repositories/drafts.py`, `candidate.py`, `profiles.py`.
- Изменить: `backend/src/cv_backend/services/draft_service.py`, `profile_service.py`.
- Изменить: `backend/src/cv_backend/api/routes/resume_drafts.py`, `profiles.py`, `app.py`.
- Создать: `backend/alembic.ini`, `backend/alembic/env.py`, migration в `backend/alembic/versions/` и migration tests.
- Изменить/создать: `backend/tests/storage/test_draft_repository.py`, `test_candidate_repository.py`, `test_profile_repository.py`, `backend/tests/api/test_resume_profiles.py`.

**Интерфейсы:**

- Все удаляемые корневые записи используют `is_deleted: bool` и `deleted_at: datetime | None`; soft-delete идемпотентен.
- `POST /api/v1/resume-drafts` создаёт пустой draft; `GET /api/v1/resume-drafts` возвращает только непроверенные и не удалённые drafts по умолчанию, а `?state=reviewed` позволяет найти проверенные.
- `POST /api/v1/resume-drafts/{draft_id}/review` явно завершает проверку, draft остаётся в БД и уходит из очереди. Поддержать выбор `state=reviewed` в списке, чтобы сохранённый draft можно было снова открыть.
- DELETE endpoints для draft, candidate item и profile только выставляют tombstone-поля. Обычные list/get исключают удалённые записи; версии, блоки, application records и selections не каскадно удаляются.

- [x] **Шаг 1: написать storage/API тесты мягкого удаления и жизненного цикла**

Добавить, среди прочих, проверки с такими результатами:

```python
deleted = client.delete(f"/api/v1/profiles/{profile['id']}")
assert deleted.status_code == 204
assert client.get(f"/api/v1/profiles/{profile['id']}").status_code == 404
assert client.get("/api/v1/profiles").json() == []

reviewed = client.post(f"/api/v1/resume-drafts/{draft_id}/review")
assert reviewed.status_code == 200
assert all(row["draft_id"] != draft_id for row in client.get("/api/v1/resume-drafts").json())
assert any(row["draft_id"] == draft_id for row in client.get("/api/v1/resume-drafts?state=reviewed").json())
```

Storage assertions additionally verify `deleted_at`, versions, draft blocks, application rows and selections remain; deleted items cannot be selected for profiles. Direct GET of a deleted resource returns 404. Repeat deletion is safe.

- [x] **Шаг 2: запустить новые тесты и проверить ожидаемый отказ**

Запуски: `Set-Location backend; & .\.venv\Scripts\python.exe -m pytest tests/storage tests/api/test_resume_profiles.py -q`.
Ожидание: новые тесты падают из-за отсутствующих tombstone-полей, фильтров и review endpoint.

- [x] **Шаг 3: реализовать модели, репозитории, API и миграцию минимальным диффом**

Добавить `is_deleted=false` и nullable `deleted_at` к `ResumeDraftModel`, `CandidateItemModel`, `SpecializationProfileModel`; расширить draft state check на `reviewed`; не добавлять удаление к историческим версиям/связям. Создать Alembic migration с upgrade/downgrade, применить и откатить её на чистой SQLite тестовой БД, затем повторно применить. Если PostgreSQL доступен в проверочной среде, проверить upgrade/downgrade и там; если нет, отметить ограничение в progress. Обновить repository queries, так что пользовательские list/get фильтруют `is_deleted=false`. Soft-delete не изменяет статус факта и не удаляет relations. Фильтровать удалённые элементы при чтении/сборке профиля и отклонять их при новых selections. При `review` установить state `reviewed`; последующее применение блока не должно возвращать черновик в очередь.

- [x] **Шаг 4: запустить фокусные и полные backend тесты**

Запуски: `Set-Location backend; & .\.venv\Scripts\python.exe -m pytest tests/storage tests/api -q`, затем полный `pytest`. Ожидание: все tombstone, ownership, review queue, migration и прежние сценарии проходят.

- [x] **Шаг 5: зафиксировать этап** — вместе с задачами 9–10 из-за общих API-маршрутов и тестовых файлов; коммит `0bee569`.

```powershell
git add backend/src/cv_backend/storage backend/src/cv_backend/services backend/src/cv_backend/api backend/migrations backend/tests
git commit -m "feat: add soft deletion and draft review lifecycle"
```

### Task 9: Новый черновик по команде и отдельный текстовый блок опыта

**Файлы:**

- Изменить: `backend/src/cv_backend/storage/repositories/drafts.py`, `backend/src/cv_backend/api/routes/resume_drafts.py`.
- Изменить: `backend/tests/api/test_resume_profiles.py`, `backend/tests/api/test_profile_creation_flow.py`.
- Изменить: `frontend/src/services/resume-profiles.ts`, `frontend/src/services/resume-profiles.test.ts`.
- Изменить: `frontend/src/features/resumeProfiles/ResumeProfilesPage.tsx`, `ResumeProfilesPage.test.tsx`.

**Интерфейсы:**

- `DraftRepository.create_empty(owner_id: UUID) -> ResumeDraftModel`.
- `DraftRepository.add_experience_block(owner_id: UUID, draft_id: UUID, text: str) -> DraftBlockModel | None`; порядковый номер — следующий после последнего блока.
- Удалить `POST /api/v1/resume-drafts/text`; добавить `POST /api/v1/resume-drafts` и `POST /api/v1/resume-drafts/{draft_id}/experience-blocks`.
- Frontend API предоставляет `listDrafts(): Promise<ResumeDraft[]>`, `createDraft(): Promise<ResumeDraft>` и `addExperienceBlock(draftId: string, text: string): Promise<ResumeDraft>`.

- [x] **Шаг 1: написать падающие API и UI тесты**

Добавить API тест, который фиксирует семантику нового endpoint:

```python
created = client.post("/api/v1/resume-drafts")
draft_id = created.json()["draft_id"]
assert created.status_code == 201
assert created.json()["blocks"] == []

added = client.post(
    f"/api/v1/resume-drafts/{draft_id}/experience-blocks",
    json={"text": "Руководил командой QA"},
)
assert added.status_code == 200
assert [(b["kind"], b["text"], b["ordinal"]) for b in added.json()["blocks"]] == [
    ("experience", "Руководил командой QA", 0)
]
```

UI tests verify that «Создать черновик» creates and displays an empty draft, saved drafts are loaded in the list after page reload, and entering text produces one `experience` block without creating another draft. Foreign, missing or soft-deleted drafts reject block creation.

- [x] **Шаг 2: запустить тесты до реализации**

Запуски: `Set-Location backend; & .\.venv\Scripts\python.exe -m pytest tests/api/test_resume_profiles.py -q`; `Set-Location frontend; npm test -- resume-profiles.test.ts ResumeProfilesPage.test.tsx`.
Ожидание: новые проверки падают на несуществующих endpoints/API-методах и кнопке.

- [x] **Шаг 3: реализовать endpoints и repository methods**

Создание через кнопку создаёт пустой сохраняемый draft. Текстовый endpoint требует существующий owned draft, создаёт только один typed `experience` block и не запускает разбор резюме/LLM. Удалить старый маршрут импорта текста и скорректировать существующие тесты/клиент, чтобы текст сам не создавал draft.

- [x] **Шаг 4: подключить UI к backend**

Добавить кнопку «Создать черновик» и отдельную форму «Добавить блок опыта» в контексте созданного/выбранного черновика. Не отправлять введённый текст через import flow; после сохранения показать обновлённые блоки ответа backend. Ошибки API отображать существующим `role="alert"`.

- [x] **Шаг 5: проверить и зафиксировать** — общий feature-коммит `0bee569`.

Запуски: фокусные backend/frontend тесты, затем полные `pytest` и `npm test`.

```powershell
git add backend/src/cv_backend backend/tests frontend/src/services/resume-profiles* frontend/src/features/resumeProfiles
git commit -m "feat: create drafts explicitly and add experience blocks"
```

### Task 10: Ошибка импорта файла в API и интерфейсе

**Файлы:**

- Изменить: `backend/src/cv_backend/api/routes/resume_drafts.py`, `backend/tests/api/test_resume_profiles.py`.
- Изменить: `frontend/src/services/resume-profiles.ts`, `frontend/src/services/resume-profiles.test.ts`, `frontend/src/features/resumeProfiles/ResumeProfilesPage.tsx`, `ResumeProfilesPage.test.tsx`.
- Изменить: `docs/requirements/traceability.md`, `docs/progress.md`, `docs/operations/backend.md`.

- [x] **Шаг 1: добавить отказные тесты**

Для повреждённого PDF, файла без извлекаемого текста и неподдерживаемого формата проверить ошибочный HTTP-ответ без созданного draft. Повторная успешная загрузка того же файла должна вернуть иной `draft_id`. В frontend service извлечь безопасное `detail` из API ответа; UI показывает понятный текст в `role="alert"` и не заменяет ранее выбранный draft ошибочным/пустым объектом.

- [x] **Шаг 2: запустить тесты до изменения кода**

Запуски: backend focus на file API и `Set-Location frontend; npm test -- resume-profiles.test.ts ResumeProfilesPage.test.tsx`.
Ожидание: падает UI проверка, поскольку клиент сейчас скрывает backend `detail` за общим текстом ошибки.

- [x] **Шаг 3: реализовать прямой отказ без создания черновика**

API возвращает существующий структурированный статус и безопасную причину ошибки; транзакция создания draft начинается только после успешного извлечения текста и формирования блоков. Frontend показывает понятную причину, не выводя извлечённый текст или персональные данные.

- [x] **Шаг 4: выполнить полные проверки и обновить трассировку**

Запуски: полный backend `pytest`; полный frontend `npm test` и `npm run build`; из корня — Python `scripts/check_docs.py` и `git diff --check`. Обновить REQ-038–REQ-049 по фактически покрытым тестами поведению и записать итоги в `docs/progress.md`.

- [x] **Шаг 5: выполнить итоговый self-review и зафиксировать** — свежий ревью-субагент недоступен в этой среде; общий коммит `0bee569`.

Убедиться, что нет LLM/OCR, исходных файлов/личных данных в базе и фикстурах, hard-delete/cascades, тихого создания draft из текстового ввода или автоматического применения изменений. Проверить миграцию и оба интерфейсных сценария от UI до API.

```powershell
git add backend frontend docs/requirements/traceability.md docs/progress.md docs/operations/backend.md
git commit -m "feat: clarify document import failure feedback"
```

## Самопроверка плана

- **Покрытие SPEC-005:** предыдущие Tasks 1–7 реализуют базовый контур; Task 8 добавляет мягкое удаление/проверку и migration; Task 9 реализует явное создание и отдельный текстовый блок; Task 10 проверяет ошибку импорта и фронтенд-сообщение.
- **Решения:** Q-007/Q-009 отражены в ADR-002; Q-008 отложен, но поддерживаемый PDF/DOCX остаётся в объёме.
- **Поведение без LLM:** тестами закреплены точные типы заголовков и сохранение неизвестных фрагментов; генерация формулировок в задачах отсутствует.
- **Целостность профиля:** тесты проверяют отдельные профили, отдельные связи skill/tool, владельца и повторные команды.
- **TDD и review focus:** каждый оставшийся Task начинается с регрессионных тестов; все пять классов риска из Review Focus закреплены API/storage/UI проверками.
- **План ожидает review пользователя.** Выполнение по ранее выбранному пользователем способу — агент реализует последовательно в текущей ветке с TDD (`native`); новый выбор способа не требуется, если это обновление плана одобрено.
