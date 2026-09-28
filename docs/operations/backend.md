---
id: DOC-006
status: active
version: 0.3
owner: Backend-разработчик (роль; персональное назначение отсутствует)
approved_by: Не требуется; инструкция эксплуатации
last_reviewed: 2026-09-28
scope: Локальная установка, проверка и запуск backend профилей резюме
---

# Локальная разработка backend

## Запуск всего проекта одной командой

При установленном Docker Desktop из корня репозитория выполните:

```powershell
docker compose up --build
```

После запуска откройте [http://localhost:8080](http://localhost:8080). Это
локальная точка входа, привязанная к loopback-интерфейсу: frontend обслуживается
через Nginx, а запросы `/api` проксируются во внутренний backend. Backend
отдельно наружу не публикуется. Не используйте этот Compose-профиль на общем
или публичном сервере: в нём включена общая development identity без
аутентификации. Остановить проект можно командой `docker compose down`; данные
локальной SQLite сохраняются в volume `cv_profiles_data`.

## Требования

- Python 3.12 или новее.
- Backend находится в `backend/` и устанавливается отдельно от frontend.
- Тесты используют временную SQLite. Для локального запуска разрешена отдельная
  development-БД; production migration пока заблокирована вопросом Q-007.

## Установка и тесты

Из корня репозитория выполните в PowerShell:

```powershell
Set-Location backend
python -m venv .venv
& .\.venv\Scripts\python.exe -m pip install -e ".[dev]"
& .\.venv\Scripts\python.exe -m pytest
```

Тестовые зависимости изолированы в `.venv`. Не устанавливайте их глобально.
Тесты используют синтетический идентификатор пользователя и временную БД;
реальное резюме или персональные данные не нужны.

Для LLM credentials backend требует `CV_LLM_ENCRYPTION_KEY`: 32 случайных
байта, представленных как 64 hex-символа. Сгенерируйте значение один раз,
сохраните в локальном `.env` или secret manager и не добавляйте этот файл в
Git. Например, локально можно выполнить
`python -c "import secrets; print(secrets.token_hex(32))"`. Ключ нельзя менять
без миграции/перешифрования сохранённых credentials: старые данные иначе
станут недоступны.

## Локальный запуск

В одном PowerShell включите локальный режим и фиксированную тестовую identity
(не используйте это для production):

```powershell
Set-Location backend
$env:CV_ENV = "development"
$env:CV_DEV_USER_ID = "00000000-0000-4000-8000-000000000001"
$env:CV_AUTO_CREATE_SCHEMA = "true"
$env:CV_LLM_ENCRYPTION_KEY = "<64 hex characters from a local secret store>"
& .\.venv\Scripts\python.exe -m uvicorn cv_backend.app:create_app --factory --reload
```

Локальный запуск по умолчанию создаёт SQLite файл `backend/cv_profiles.sqlite3`.
Его схема создаётся только при явно включённом `CV_AUTO_CREATE_SCHEMA=true` и
только в `CV_ENV=development`. Для другой локальной БД задайте `DATABASE_URL`.
В production этот флаг не выполняет ничего; до закрытия Q-007 и миграции
production schema не поддержана.

Frontend в другом окне: `Set-Location frontend; npm run dev`. Vite проксирует
`/api` на `http://127.0.0.1:8000`; можно задать `VITE_API_BASE_URL`, если нужен
иной адрес backend.

Проверка готовности: `GET http://127.0.0.1:8000/health`, ожидаемый ответ —
`{"status":"ok"}`. Это технический smoke endpoint, не проверка доступности
базы или внешних сервисов. В обычном режиме API fail-closed с HTTP 401. Только
при явном `CV_ENV=development` и `CV_DEV_USER_ID` включается одна тестовая
identity; переключатель не доступен в production.

Docker Compose требует `CV_LLM_ENCRYPTION_KEY` в локальном `.env` до запуска
`docker compose up --build`; без ключа Compose завершится fail-closed.

## Реализованные маршруты

- `POST /api/v1/resume-drafts/text` — разобрать текст и сохранить редактируемый
  черновик без переноса фактов в candidate base.
- `POST /api/v1/resume-drafts/file` — временно прочитать PDF/DOCX (максимум
  20 MiB), извлечь текст, создать блоки и закрыть загруженный файл; оригинал
  не хранится. PDF без текстового слоя и неподдерживаемый формат отклоняются.
- `GET /api/v1/resume-drafts/{id}` и `PATCH /api/v1/resume-drafts/{id}/blocks/{block_id}`
  — получить черновик и отдельно редактировать текст одного блока.
- `POST /api/v1/resume-drafts/{id}/blocks/{block_id}/apply` — явное применение
  typed элементов пользователя в общую базу; повтор защищён idempotency key.
- `GET /api/v1/candidate-base/items` — список собственных записей.
- `/api/v1/profiles` — создать, получить, перечислить, изменить, удалить профиль
  и независимо назначить в нём факты, навыки и инструменты.
- `POST/GET /api/v1/llm-connections` — сохранить своё подключение и получить
  безопасные метаданные без возврата credentials.
- `POST /api/v1/llm-connections/{id}/test` — выполнить короткий provider test
  и вернуть статус/категорию ошибки без текста генерации.

Внутренние backend-модули используют `LLMGateway.complete()` напрямую;
публичного proxy для произвольных prompts нет. Поддерживаются OpenAI,
OpenAI-compatible HTTPS, YandexGPT и GigaChat. Для реальных provider вызовов
нужны собственные API credentials; тестовые наборы используют mocked transport
и синтетические ключи. Удаление/деактивация подключений отложены до решения
Q-010.

## Ограничения текущего этапа

OAuth провайдер не подключён. Alembic migration для текущей схемы добавлена и
проверяется на временной SQLite; миграция PostgreSQL и baseline для
существующей ad-hoc базы требуют отдельной проверки. Продуктовый flow ограничен созданием
профилей, текстовым/PDF/DOCX импортом черновика и его блочным редактированием;
автоматического извлечения фактов и выбора полей в профиле интерфейс пока не
предоставляет. Сканированные PDF без текстового слоя не обрабатываются (OCR
не используется).
