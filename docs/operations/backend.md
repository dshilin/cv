---
id: DOC-006
status: active
version: 0.5
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
Оба dev-сервиса используют политику `restart: unless-stopped`: после
перезапуска Docker engine они запускаются повторно, пока пользователь явно
не остановит проект или не выполнит `docker compose down`.

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

VK ID вход активируется отдельно переменными `VK_ID_APP_ID`,
`VK_ID_REDIRECT_URI` (должен точно совпадать с callback, зарегистрированным
в кабинете VK ID) и случайным `CV_AUTH_STATE_SECRET` из secret manager. Callback:
`/api/v1/auth/vk/callback`. В production применяйте только HTTPS; session и
OAuth flow cookies выставляются с `Secure`. Проверьте рабочий сценарий на
зарегистрированном VK ID приложении после настройки этих параметров.
Без конфигурации `/api/v1/auth/vk/start` отвечает 503. Текущая development
identity остаётся доступна только при явных `CV_ENV=development` и
`CV_DEV_USER_ID`.

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
Для текущего dev checkout локальный `.env` подготовлен и игнорируется Git.

## Проверка VK ID на локальном dev

VK ID login заменяет development identity для backend, поэтому на время
проверки нужно задать в корневом `.env`:

```dotenv
CV_DEV_USER_ID=
VK_ID_APP_ID=<APP_ID из кабинета VK ID>
VK_ID_REDIRECT_URI=https://<публичный HTTPS hostname>/api/v1/auth/vk/callback
CV_AUTH_STATE_SECRET=<случайная строка не короче 32 байт>
CV_SESSION_COOKIE_SECURE=true
```

Создайте приложение VK ID и зарегистрируйте в нём тот же точный HTTPS callback.
Для локального `http://localhost:8080` поднимите временный HTTPS tunnel на порт
8080. Например, в отдельном PowerShell запустите tunnel в Docker:

```powershell
docker run --rm -it cloudflare/cloudflared:latest tunnel --url http://host.docker.internal:8080
```

Команда напечатает случайный `https://….trycloudflare.com`; оставьте tunnel
работать на время проверки. В VK ID зарегистрируйте callback с этим hostname и
путём `/api/v1/auth/vk/callback`, затем укажите его в `.env` и откройте приложение
через HTTPS URL. После перезапуска tunnel адрес может измениться — обновите его
и в кабинете VK ID, и в `.env`. Официальная документация VK ID требует APP_ID и
задаёт redirect URL в конфигурации приложения; Cloudflare описывает Quick Tunnel
как временный адрес для разработки. Пока tunnel запущен, этот dev frontend
доступен извне по случайному публичному адресу; используйте для проверки
тестовые данные.

Секрет state можно сгенерировать командой
`python -c "import secrets; print(secrets.token_urlsafe(48))"`; сохраните вывод
только в `.env`. Не присылайте секрет в чат и не добавляйте `.env` в Git.
После настройки пересоздайте dev сервисы:

```powershell
docker compose up --build -d
docker compose ps
```

Откройте `https://<публичный HTTPS hostname>/login`. Должна появиться кнопка
«Войти через VK ID». Нажмите её, пройдите авторизацию тестовым аккаунтом VK,
убедитесь, что браузер вернулся на `/profile`, а `GET /api/v1/auth/me` сообщает
`authenticated: true`. Проверьте выход и повторный вход. Если выдать VK ID
приложению тестовый режим, проходите flow аккаунтом, разрешённым настройками
этого приложения.

Чтобы вернуться к обычному локальному dev-режиму, удалите `CV_DEV_USER_ID=` из
`.env` (или верните значение `00000000-0000-4000-8000-000000000001`) и снова
выполните `docker compose up -d`. Без `VK_ID_APP_ID`, точного redirect URI и
state secret реальный OAuth flow не завершится; локальная development identity
включена по умолчанию только для этого Compose dev окружения.

## Реализованные маршруты

- `POST /api/v1/resume-drafts/text` — разобрать текст и сохранить редактируемый
  черновик без переноса фактов в candidate base.
- `POST /api/v1/resume-drafts/file` — временно прочитать PDF/DOCX (максимум
  20 MiB), извлечь текст, создать блоки и закрыть загруженный файл; оригинал
  не хранится. PDF без текстового слоя и неподдерживаемый формат отклоняются.
- `GET /api/v1/resume-drafts/{id}` и `PATCH /api/v1/resume-drafts/{id}/blocks/{block_id}`
  — получить черновик и отдельно редактировать текст одного блока.
- `GET /api/v1/resume-drafts` включает все не удалённые черновики с названием,
  датами, состоянием проверки и отдельным прогрессом переноса. Название
  меняется через `PATCH /api/v1/resume-drafts/{id}`; проверка выполняется
  `POST /api/v1/resume-drafts/{id}/review`. Любая сохранённая правка сбрасывает
  `review_status` в `needs_user_review`.
- `GET/PATCH /api/v1/candidate-base` читают и меняют `full_name`; контакты
  общей базы управляются через `/api/v1/candidate-base/contacts`.
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

VK ID OAuth подключён при наличии credentials; Яндекс ID не реализован.
Alembic migration для текущей схемы добавлена и
проверяется на временной SQLite; миграция PostgreSQL и baseline для
существующей ad-hoc базы требуют отдельной проверки. Продуктовый flow ограничен созданием
профилей, текстовым/PDF/DOCX импортом черновика и его блочным редактированием;
автоматического извлечения фактов и выбора полей в профиле интерфейс пока не
предоставляет. Сканированные PDF без текстового слоя не обрабатываются (OCR
не используется).
