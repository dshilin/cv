---
id: PLAN-002
status: approved
version: 1.1
owner: Backend-разработчик (роль; персональное назначение отсутствует)
approved_by: Пользователь — поручение начать реализацию «пиши реализацию первую как сам понимаешь согласно всех необходимых нюансов включая TDD», чат 2026-09-25
last_reviewed: 2026-09-25
scope: Поэтапная реализация SPEC-005 в backend-модуле
---

# Backend профилей резюме — план реализации

> **Для исполнителя:** перед началом реализации применить `superpowers:subagent-driven-development` (рекомендуется) либо `superpowers:executing-plans`. Выполнять задачи по одной; шаги отмечаются чекбоксами.

**Цель:** Реализовать backend для импорта текста и документов в сохраняемые черновики, общей базы кандидата и нескольких независимых специализационных профилей.

**Архитектура:** Новый модуль `backend/` на Python реализует модульный монолит с FastAPI и Pydantic. Доменное разбиение, извлечение документов и правила изменения профиля отделены от API и хранения. PostgreSQL/SQLAlchemy/Alembic соответствуют рекомендуемому стеку SPEC-002; доступ к пользователю внедряется через заменяемую зависимость, поскольку OAuth-провайдер не входит в этот этап. Исходный файл обрабатывается временно, а сохраняемый черновик содержит разобранные блоки.

**Стек:** Python 3.12+, FastAPI, Pydantic, SQLAlchemy, Alembic, PostgreSQL, pytest, HTTPX TestClient; `python-multipart` для multipart upload. Библиотеки PDF/DOCX выбираются после проверки официальной документации перед реализацией файлового импорта. Unit/API tests используют временную SQLite базу; миграции дополнительно проверяются на PostgreSQL до релиза.

**Спецификация:** [SPEC-005 — Дизайн backend профилей резюме](../specs/2026-09-25-resume-profile-backend-design.md)

## Общие ограничения

- Разбор выполняется детерминированно, без LLM.
- Загруженный PDF/DOCX удаляется после извлечения текста, включая путь ошибки.
- Черновик хранится отдельно и сам по себе не меняет базу кандидата или профиль.
- Только явная команда пользователя создаёт, редактирует или удаляет постоянные данные.
- Каждый аккаунт может иметь несколько профилей; выбор и порядок данных одного профиля не меняют остальные профили.
- Навыки и инструменты хранятся раздельно и включаются в специализационный профиль независимо.
- Не записывать реальные резюме, персональные данные, содержимое документов и загруженные файлы в тестовые фикстуры, логи или репозиторий.
- Не реализовывать авторизацию через Яндекс/VK, вакансии, рыночный анализ, генерацию документов или отправку откликов в рамках этого плана.
- Перед schema migrations согласовать модель сущностей и жизненный цикл статусов с открытыми Q-004, Q-005 и Q-007.
- Перед файловым импортом получить решение по Q-008 (сканированные PDF/OCR и `.doc`); перед политикой автоматической очистки черновиков получить решение по Q-009.
- Предлагаемые технические значения для review: предел загрузки 20 MiB, очистка заброшенных временных файлов старше 15 минут, SQLite для unit/API tests и PostgreSQL для production migration check. Это конфигурационные defaults, не ограничения формата резюме.

## Особое внимание при проверке

- PDF содержит текст, но извлечение частичное или нарушает порядок чтения: сохранить весь доступный текст и показать непонятные фрагменты отдельно. Task 5 проверяет частичное извлечение и сохранение фрагментов.
- Сканированный PDF не содержит текстового слоя: вернуть явную ошибку/инструкцию, не создавать пустой успешный черновик и не запускать OCR до решения Q-008. Task 5 проверяет отказ без черновика.
- DOCX повреждён, переименован или имеет неверный MIME: отклонить по фактическому формату и удалить временные байты. Task 5 проверяет повреждение и несовпадение формата.
- Повторный импорт или повторная команда переноса блока: не создавать дубли; совпадения показать для ручного решения. Tasks 3, 6 и 7 проверяют повторное применение и повторный импорт.
- Изменение общей записи, используемой несколькими профилями: выполнить только запрошенное пользователем действие и явно показать затронутые профили; не переписывать их формулировки. Tasks 4 и 6 проверяют независимость профилей и отсутствие автоматического переписывания.

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
- `backend/src/cv_backend/services/upload_temp.py` — временное размещение байтов и гарантированное удаление.
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

**Decision gate:** до миграции сверить статусы, сущности опыта и историю с Q-004, Q-005 и Q-007. Обновить SPEC-003/SPEC-005 или создать ADR и получить продуктовое решение на любое изменение смысла. Не мигрировать до закрытия зависимых вопросов.

**Файлы:**

- Создать: `backend/src/cv_backend/domain/candidate.py`
- Создать: `backend/src/cv_backend/storage/database.py`, `backend/src/cv_backend/storage/models/draft.py`, `backend/src/cv_backend/storage/models/candidate.py`
- Создать: `backend/src/cv_backend/storage/repositories/drafts.py`, `backend/src/cv_backend/storage/repositories/candidate.py`
- Создать: `backend/src/cv_backend/services/draft_service.py`
- Создать: `backend/alembic.ini`, `backend/alembic/env.py`, `backend/alembic/versions/`
- Создать: `backend/tests/storage/test_draft_repository.py`, `backend/tests/storage/test_candidate_repository.py`
- Изменить после решения вопросов: `docs/architecture/experience.md`, `docs/requirements/traceability.md`, `docs/governance/open-questions.md`

**Интерфейсы:**

- `DraftRepository.create(owner_id: UUID, blocks: list[DraftBlockInput]) -> ResumeDraft`.
- `DraftRepository.get(owner_id: UUID, draft_id: UUID) -> ResumeDraft | None`.
- `DraftService.apply_block(owner_id: UUID, draft_id: UUID, block_id: UUID, idempotency_key: str) -> CandidateItem`; repeated calls with the same key return the same applied item.
- `CandidateItemInput` содержит тип факта и валидированные типизированные поля для опыта, проекта, навыка, инструмента, образования, сертификата, языка или контакта; произвольный payload без схемы запрещён.
- `CandidateRepository.add_items(owner_id: UUID, items: list[CandidateItemInput]) -> list[CandidateItem]`.
- `CandidateRepository.update_item(owner_id: UUID, item_id: UUID, patch: CandidateItemPatch) -> CandidateItem`; обновляет только поля, присланные пользователем, и не меняет профильные переопределения.
- Каждая запись имеет владельца; репозиторий всегда требует `owner_id` в запросах на чтение/изменение.

- [ ] **Шаг 1: написать repository-тесты с изолированной тестовой БД**

Проверить на временной SQLite базе, что черновик и блоки восстанавливаются после новой сессии, запись другого владельца не возвращается, а применение одинакового idempotency key не создаёт дубликат.

- [ ] **Шаг 2: выполнить тесты до реализации**

Запуск: `Set-Location backend; & .\.venv\Scripts\python.exe -m pytest tests/storage/test_draft_repository.py tests/storage/test_candidate_repository.py -q`
Ожидание: FAIL, модели и репозитории отсутствуют.

- [ ] **Шаг 3: реализовать модели и миграцию после закрытия gate**

Определить таблицы черновиков и упорядоченных блоков, candidate items с типом и связями на проекты, навыки и инструменты. Хранить текст разобранного блока в черновике. Не создавать таблицу или объект для исходного файла. Применение блоков выполняется транзакционно и только явной командой.

- [ ] **Шаг 4: проверить изоляцию, транзакцию и миграции**

Запуск: `Set-Location backend; & .\.venv\Scripts\python.exe -m pytest tests/storage -q`
Ожидание: PASS; миграции можно применить к пустой тестовой БД, откатить до пустой схемы и применить повторно.

- [ ] **Шаг 5: зафиксировать модель данных**

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

- [ ] **Шаг 1: написать изоляционные тесты для двух профилей**

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

- [ ] **Шаг 2: подтвердить, что тесты ловят отсутствующую независимость**

Запуск: `Set-Location backend; & .\.venv\Scripts\python.exe -m pytest tests/unit/test_profile_service.py -q`
Ожидание: FAIL до реализации `ProfileService`.

- [ ] **Шаг 3: реализовать CRUD и профильные связи**

Хранить названия, целевые должности, условия поиска, заголовок, описание и пользовательские формулировки в профиле. Хранить выбор и порядок общих записей, навыков, инструментов и разделов как профильные связи. Добавить Alembic migration для таблиц профиля и связей. Запросы с чужими или удалёнными item IDs отклонять целиком, не сохранять частичный набор.

- [ ] **Шаг 4: проверить независимость и пользовательские изменения**

Запуск: `Set-Location backend; & .\.venv\Scripts\python.exe -m pytest tests/unit/test_profile_service.py tests/storage/test_profile_repository.py -q`
Ожидание: PASS для двух профилей, независимого порядка, выбранных навыков/инструментов, удаления профиля без удаления базы и запрета владельцу менять чужой профиль.

- [ ] **Шаг 5: зафиксировать этап**

```powershell
git add backend/src/cv_backend/domain backend/src/cv_backend/storage backend/src/cv_backend/services/profile_service.py backend/tests
git commit -m "feat: add independent resume specialization profiles"
```

### Task 5: Временное извлечение PDF/DOCX

**Decision gate:** перед кодом закрыть Q-008. До этого реализуются только изолированные интерфейсы и тесты для уже согласованных типов; поддержка OCR или `.doc` не подразумевается.

**Файлы:**

- Создать: `backend/src/cv_backend/services/upload_temp.py`, `backend/src/cv_backend/services/document_extractor.py`
- Создать: `backend/tests/unit/test_upload_temp.py`, `backend/tests/unit/test_document_extractor.py`
- Создать после выбора библиотек: малые синтетические fixtures в `backend/tests/fixtures/`

**Интерфейсы:**

- `extract_document(upload: UploadFile) -> ExtractedDocumentText`.
- `ExtractedDocumentText = { text: str, detected_format: Literal["pdf", "docx"] }`.
- `with_temporary_upload(upload, extractor) -> ExtractedDocumentText` удаляет временный файл/буфер в `finally` независимо от успеха.

- [ ] **Шаг 1: сверить официальные документы библиотек PDF/DOCX**

Перед установкой зависимостей определить поддерживаемую Python-версию, API извлечения текста и известные ограничения выбранных библиотек. Записать URL, дату проверки и ограничения в ADR/архитектурную заметку.

- [ ] **Шаг 2: написать тесты удаления и валидации**

Проверить корректный текстовый PDF и DOCX, частично извлечённый текст, пустой/повреждённый документ, несоответствие расширения сигнатуре, превышение лимита, исключение extractor и очистку старого temp-файла. Во всех случаях после возврата или ошибки временные байты отсутствуют, а активные недавние temp-файлы сохраняются.

- [ ] **Шаг 3: выполнить тесты до реализации**

Запуск: `Set-Location backend; & .\.venv\Scripts\python.exe -m pytest tests/unit/test_upload_temp.py tests/unit/test_document_extractor.py -q`
Ожидание: FAIL, функции извлечения отсутствуют.

- [ ] **Шаг 4: реализовать ограниченную временную обработку**

Ограничить загрузку конфигурацией `MAX_UPLOAD_BYTES` со стартовым значением 20 MiB. Проверять размер потоком до полной записи и фактическую сигнатуру контейнера; не доверять имени файла или MIME отдельно. Использовать отдельный системный temp-каталог приложения, очищать файл в `finally` после каждого запроса и удалять оставшиеся файлы старше 15 минут при запуске. Не писать имя/текст документа в лог. OCR не добавлять без явного решения.

- [ ] **Шаг 5: проверить библиотечные fixtures и повторно выполнить тесты**

Запуск: `Set-Location backend; & .\.venv\Scripts\python.exe -m pytest tests/unit/test_upload_temp.py tests/unit/test_document_extractor.py -q`
Ожидание: PASS; после тестов нет файлов в temp-каталоге, а нераспознанный текст не теряется.

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

- [ ] **Шаг 1: написать API-тесты с подменёнными account IDs и тесты frontend API-клиента**

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

- [ ] **Шаг 2: выполнить API-тесты до реализации маршрутов**

Запуск: `Set-Location backend; & .\.venv\Scripts\python.exe -m pytest tests/api/test_resume_drafts.py tests/api/test_candidate_base.py tests/api/test_profiles.py -q`
Ожидание: FAIL с 404 или отсутствующими импортами до подключения роутеров.

- [ ] **Шаг 3: подключить пользовательские команды и коды ошибок**

Подключить тестовую dependency пользователя и сервисы. Импорт создаёт только черновик. Блок применяет пользовательская команда, затем сервис сохраняет подтверждённые данные в общей базе; пользователь отдельно выбирает их в профиле. PATCH изменяет только указанные поля. Все записи проверяются на владельца в одной транзакции.

- [ ] **Шаг 4: проверить API, транзакции и ошибки**

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

- [ ] **Шаг 1: написать сквозной сценарий на синтетических данных**

Проверить путь: текстовый импорт → сохраняемый черновик → редактирование одного блока → явное включение в общую базу → создание профилей AI и QA → выбор разных фактов, навыков и инструментов → изменение AI-профиля без изменения QA → повторный импорт и ручное разрешение совпадения.

- [ ] **Шаг 2: выполнить сценарий и исправить расхождения**

Запуск: `Set-Location backend; & .\.venv\Scripts\python.exe -m pytest tests/api/test_profile_creation_flow.py -q`
Ожидание: PASS; в сценарии ни одна запись не появляется в постоянной базе до команды пользователя.

- [ ] **Шаг 3: обновить команды локального запуска и регистрации требований**

В `docs/operations/backend.md` описать настройку тестовой БД, миграции, запуск API и тестов. В traceability заменить статусы только для тех REQ-038–REQ-045, которые реально покрыты тестами, ссылаясь на конкретные файлы. В progress указать оставшиеся gate или ограничения OCR/retention.

- [ ] **Шаг 4: запустить проверки перед завершением реализации**

Запуски:

```powershell
Set-Location backend; & .\.venv\Scripts\python.exe -m pytest
Set-Location ..; python scripts/check_docs.py
git diff --check
```

Ожидание: backend suite и документационная проверка успешны; тесты не используют реальные персональные данные, временные загрузки удалены.

- [ ] **Шаг 5: выполнить обзор и коммит**

Проверить staged diff на незапрошенные интеграции, автоматические изменения данных, исходные файлы в постоянном хранилище и чувствительные тестовые данные. Сохранить итоговые связи в traceability и зафиксировать сквозной этап отдельным коммитом.

## Самопроверка плана

- **Покрытие SPEC-005:** импорт текста — Task 2; сохранение/применение черновика — Tasks 3 и 6; PDF/DOCX и удаление временных байтов — Task 5; база кандидата — Task 3; навыки, инструменты и несколько профилей — Task 4; API и изоляция владельца — Task 6; сквозной путь, docs и traceability — Task 7.
- **Открытые решения:** Q-004, Q-005 и Q-007 являются gate до миграций; Q-008 — gate до реализации файловых форматов; Q-009 — gate до автоматической очистки черновиков. Текстовый парсер и scaffold можно делать независимо.
- **Поведение без LLM:** тестами закреплены точные типы заголовков и сохранение неизвестных фрагментов; генерация формулировок в задачах отсутствует.
- **Целостность профиля:** тесты проверяют отдельные профили, отдельные связи skill/tool, владельца и повторные команды.
- **Плейсхолдеры:** в плане нет незаполненных задач и неназванных интерфейсов; единственное действие на пользовательское решение — перечисленные decision gates с точными ID открытых вопросов.
