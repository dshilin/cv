---
id: PLAN-003
status: approved
version: 1.1
owner: Backend-разработчик (роль; персональное назначение отсутствует)
approved_by: Пользователь подтвердил границы SPEC-006 и архитектуру 2026-09-28, затем выбрал Native execution плана
last_reviewed: 2026-09-28
scope: Реализация SPEC-006 в backend API и внутреннем LLM gateway
---

# Backend LLM Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Цель:** Добавить owner-scoped хранение пользовательских подключений к OpenAI/OpenAI-compatible, YandexGPT и GigaChat и общий внутренний синхронный интерфейс текстовой генерации.

**Архитектура:** FastAPI API управляет подключениями в контексте текущего владельца, а `LLMGateway.complete()` вызывает provider adapter и нормализует результат. Credentials шифруются перед сохранением; provider-specific адаптеры изолируют авторизацию и формат запросов. Публичного универсального proxy-endpoint для произвольных промптов не создаётся: тест генерации доступен как ограниченная команда проверки подключения, а прикладные backend-модули вызывают gateway напрямую.

**Стек:** Python 3.12+, FastAPI, Pydantic v2, SQLAlchemy, Alembic, PostgreSQL, pytest, HTTPX; библиотека AES-GCM выбирается и сверяется с официальной документацией перед реализацией. Внешние API тестируются через подменённый HTTP transport без реальных ключей и сетевых вызовов.

**Спецификация:** [SPEC-006 — Дизайн backend-интеграции LLM-провайдеров](../specs/2026-09-28-llm-provider-integration-design.md)

## Глобальные ограничения

- Реализуется только backend-интеграция LLM и общий внутренний интерфейс; пользовательский интерфейс не добавляется.
- Вакансии, подготовка резюме и писем, версии откликов, экспорт/копирование и отправка работодателю исключены.
- Поддерживается синхронная текстовая генерация Chat Completions с `messages`, `model`, `temperature` и ограничением токенов.
- Поддерживаются OpenAI, OpenAI-compatible HTTPS endpoint, Yandex AI Studio/YandexGPT и GigaChat; автоматического fallback между провайдерами нет.
- Credentials каждого подключения принадлежат одному `owner_id`, шифруются AES-256-GCM в БД и не возвращаются API, логами, traces или сообщениями ошибок. `CV_LLM_ENCRYPTION_KEY` — 32 байта в виде 64 hex-символов без значения по умолчанию.
- Произвольный OpenAI-compatible endpoint проверяется против SSRF: только HTTPS, блокировка loopback/private/link-local адресов и небезопасных redirect.
- Production-вызовы остаются закрытыми до появления реальной пользовательской identity; dev identity не считается production-аутентификацией.
- Решение Q-010 о семантике удаления/деактивации и резервных копиях не принимается этим планом; соответствующую команду нельзя выпускать до закрытия вопроса.

## Review Focus

- Чужой владелец запрашивает существующее подключение: чтение, проверка и генерация должны завершаться одинаковым безопасным отказом; покрыть API-тестом.
- Секреты присутствуют в upstream error body или исключении HTTP-клиента: ответ и захваченные логи не должны содержать секрет; покрыть adapter/API тестами.
- OpenAI-compatible URL разрешается в private IP или отвечает redirect на private IP: запрос не должен уйти; покрыть unit/transport тестами.
- Провайдер возвращает timeout, 429, 5xx, invalid credentials либо невалидный JSON: gateway возвращает согласованную категорию без prompt/ответа/секрета; покрыть параметризованными тестами.
- GigaChat access token истёк или одновременно запрашивается несколькими вызовами: токен обновляется по сроку, параллельные обновления не создают гонку; покрыть тестами кэша токена.

---

## Структура файлов и интерфейсы

- `backend/src/cv_backend/llm/contracts.py` — provider-neutral типы запроса, ответа и нормализованной ошибки.
- `backend/src/cv_backend/llm/gateway.py` — `LLMGateway.complete(owner_id, connection_id, request) -> LLMResponse`.
- `backend/src/cv_backend/llm/providers/` — общий HTTPX транспорт, OpenAI-compatible, YandexGPT и GigaChat адаптеры.
- `backend/src/cv_backend/llm/security.py` — AES-GCM шифрование/расшифрование с ключом из конфигурации.
- `backend/src/cv_backend/storage/models/llm_connection.py` и `repositories/llm_connections.py` — owner-scoped подключения и persistence.
- `backend/src/cv_backend/services/llm_connections.py` — создание, безопасное чтение списка и проверка подключения.
- `backend/src/cv_backend/api/routes/llm_connections.py` — CRUD-подобные безопасные операции и ограниченная проверка; destructive remove/deactivate остаются за Q-010.
- `backend/migrations/versions/` — schema migration; `backend/tests/` — contract, crypto, provider, storage и API проверки.
- `docs/operations/backend.md`, `docs/architecture/system.md`, `docs/requirements/traceability.md`, `docs/governance/open-questions.md` — запуск/конфигурация, архитектура, критерии и разрешение Q-010 по факту реализации.

### Контракты

```python
class LLMMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str

class LLMRequest(BaseModel):
    messages: list[LLMMessage]
    model: str
    temperature: float | None = None
    max_tokens: int | None = None

class LLMResponse(BaseModel):
    text: str
    provider: str
    model: str
    usage: LLMUsage | None = None

class LLMGateway:
    async def complete(self, owner_id: UUID, connection_id: UUID,
                       request: LLMRequest) -> LLMResponse: ...
```

Gateway загружает только принадлежащее `owner_id` подключение и принимает только прошедшее проверку. Provider adapter имеет интерфейс `complete(connection: DecryptedLLMConnection, request: LLMRequest) -> LLMResponse`; расшифрованные credentials живут только в памяти вызова. API DTO списка подключения содержит `id`, `provider`, безопасные публичные настройки, `default_model`, `status`, `last_tested_at`, но не credential или ciphertext.

---

### Task 1: Контракт и скелет внутреннего gateway

**Файлы:**
- Создать `backend/src/cv_backend/llm/__init__.py`, `contracts.py`, `errors.py`, `gateway.py`.
- Тесты: `backend/tests/unit/test_llm_contracts.py`, `backend/tests/unit/test_llm_gateway.py`.

**Интерфейсы:** `LLMMessage`, `LLMRequest`, `LLMUsage`, `LLMResponse`; `LLMGateway.complete(owner_id: UUID, connection_id: UUID, request: LLMRequest) -> LLMResponse`. Gateway зависит от repository и registry adapter, заданных протоколами.

- [x] Написать тесты валидации ролей, непустого набора messages, диапазона temperature и max_tokens; тест gateway подтверждает owner-scoped lookup и отказ для неактивного/непроверенного connection.
- [x] Запустить `pytest backend/tests/unit/test_llm_contracts.py backend/tests/unit/test_llm_gateway.py -q`; ожидаемое падение — отсутствует `cv_backend.llm`.
- [x] Реализовать DTO, `LLMError` с категориями из SPEC-006 и gateway с внедряемыми repository/provider registry.
- [x] Повторить команду; PASS, 13 тестов.

### Task 2: Шифрование credentials и конфигурация ключа

**Файлы:**
- Создать `backend/src/cv_backend/llm/security.py` и `backend/tests/unit/test_llm_security.py`.
- Изменить `backend/pyproject.toml`, конфигурационный модуль backend и `docker-compose.yml` только для передачи обязательного ключа через окружение/secret manager без значения по умолчанию.
- Изменить `docs/operations/backend.md` с инструкцией генерации/передачи ключа.

**Интерфейсы:** `CredentialCipher.encrypt(plaintext: bytes) -> bytes`; `CredentialCipher.decrypt(ciphertext: bytes) -> bytes`; ключ — ровно 32 байта для AES-256-GCM, nonce уникален и сохраняется вместе с ciphertext/tag в зашифрованном формате.

- [x] Тестами зафиксировать round-trip, уникальность nonce, отказ при неверном ключе/повреждённом ciphertext и отказ загрузки конфигурации без ключа.
- [x] Запустить `pytest backend/tests/unit/test_llm_security.py -q`; ожидаемое падение — отсутствует `cv_backend.llm.security`.
- [x] Перед добавлением библиотеки прочитать официальные docs выбранной crypto-библиотеки и записать URL/дату в ADR-003; реализовать AES-GCM и fail-closed config без fallback-ключа.
- [x] Повторить фокусный тест; PASS, 4 теста с `cryptography 50.0.1` из bundled runtime. Зависимость объявлена в `pyproject.toml`; установка её в локальное `.venv` заблокирована сетевой политикой среды. Compose требует внешний ключ и не содержит реального секрета.

### Task 3: Connection model, repository и миграция

**Файлы:**
- Создать `backend/src/cv_backend/storage/models/llm_connection.py`, `backend/src/cv_backend/storage/repositories/llm_connections.py`, `backend/tests/storage/test_llm_connections_repository.py`.
- Изменить `backend/src/cv_backend/storage/models/__init__.py`, `backend/migrations/versions/` и при необходимости фабрику session/repository.

**Интерфейсы:** `LLMConnection` хранит `id`, `owner_id`, provider kind, безопасные настройки, encrypted credentials, default model, status и timestamps. Repository: `create(owner_id, data)`, `get_for_owner(owner_id, connection_id)`, `list_for_owner(owner_id)`; запросы всегда фильтруются по owner.

- [x] Написать storage-тесты на изоляцию двух владельцев, безопасные статусы и сериализацию ciphertext без plaintext.
- [x] Запустить `pytest backend/tests/storage/test_llm_connections_repository.py -q`; ожидаемое падение — отсутствует модель подключения.
- [x] Реализовать модель и методы repository; добавить Alembic migration с index/check ограничениями, согласованными с существующей схемой.
- [x] Запустить фокусный storage-тест и проверку миграции на чистой SQLite test DB; PASS, 3 теста, включая upgrade до head.

### Task 4: Безопасный HTTP транспорт и OpenAI-compatible adapter

**Файлы:**
- Создать `backend/src/cv_backend/llm/providers/openai_compatible.py`, `endpoint_security.py`, `http_transport.py`, `backend/tests/unit/test_openai_compatible_provider.py`, `backend/tests/unit/test_endpoint_security.py`.
- Добавить runtime зависимости HTTPX и httpcore в `backend/pyproject.toml`.

**Интерфейсы:** `ProviderAdapter.complete(connection, request) -> LLMResponse`; transport ограничивает connect/read/write/pool timeout, закрепляет TCP соединение за публичным IP, проверенным перед вызовом, сохраняет оригинальный TLS hostname и не следует redirect. OpenAI adapter отправляет Chat Completions с bearer API key на фиксированный официальный base URL; OpenAI `max_tokens` нормализованного контракта передаётся как `max_completion_tokens`, а совместимые endpoint получают `max_tokens`.

- [x] Написать transport mock тесты на корректный Authorization/body, нормализацию текста/model/usage и категории invalid key, 429, timeout, 5xx, malformed response; отдельно тестировать отсутствие секрета и response body в тексте исключения.
- [x] Написать endpoint-security тесты для HTTPS, localhost, IPv4/IPv6 private/link-local, DNS resolution в private IP и redirect; транспорт закрепляет соединение за вторым проверенным DNS ответом и сохраняет hostname для TLS.
- [x] Запустить два фокусных набора; ожидаемое падение — отсутствует provider package.
- [x] Проверить официальные OpenAI endpoint требования; реализовать HTTP transport и adapter. Для SSRF защита закрепляет проверенный публичный IP на уровне `httpcore.AsyncNetworkBackend`; redirect запрещён.
- [x] Повторить наборы; PASS, 22 теста, mocked transport не обращается в сеть.

### Task 5: YandexGPT adapter и connection validation

**Файлы:**
- Создать `backend/src/cv_backend/llm/providers/yandex.py` и `backend/tests/unit/test_yandex_provider.py`.
- Изменить provider registry/config schema и `docs/decisions/ADR-003-llm-provider-adapters.md` при подтверждении особенностей протокола.

**Интерфейс:** Adapter строит Yandex model URI из/проверяет сохранённый model URI и передаёт API key + folder ID в поддерживаемом OpenAI-compatible Chat Completions запросе.

- [x] Тестами зафиксировать обязательные API key, folder ID и model URI, wire request, normalized response и provider errors.
- [x] Запустить `pytest backend/tests/unit/test_yandex_provider.py -q`; ожидаемое падение — отсутствует Yandex adapter.
- [x] Сверить точный `Authorization: Api-Key`, `OpenAI-Project`, base URL и `gpt://<folder-id>/<model>` с актуальной официальной документацией Yandex AI Studio; реализовать adapter через общий transport.
- [x] Повторить Yandex и общий OpenAI фокусные тесты; PASS, 14 тестов.

### Task 6: GigaChat authentication и adapter

**Файлы:**
- Создать `backend/src/cv_backend/llm/providers/gigachat.py`, `token_cache.py` и `backend/tests/unit/test_gigachat_provider.py`.

**Интерфейсы:** `GigaChatTokenProvider.get_token(connection) -> AccessToken`; кэш содержит access token только в памяти процесса, scope и expires_at; adapter использует credentials/scope для OAuth exchange и полученный token для completion.

- [x] Тестами зафиксировать `RqUID`, scope, token exchange, expiry refresh с запасом времени, параллельное single-flight обновление, completion request и нормализацию ошибок без вывода секретов.
- [x] Запустить `pytest backend/tests/unit/test_gigachat_provider.py -q`; ожидаемое падение — отсутствует GigaChat adapter.
- [x] Сверить авторизацию, endpoints и срок действия с актуальными официальными документами GigaChat; реализовать изолированный GigaChat adapter и token cache.
- [x] Повторить фокусный тест; PASS, 7 тестов.

### Task 7: Connection service и owner-scoped API

**Файлы:**
- Создать `backend/src/cv_backend/services/llm_connections.py`, `backend/src/cv_backend/api/schemas/llm_connections.py`, `backend/src/cv_backend/api/routes/llm_connections.py`, `backend/tests/api/test_llm_connections.py`.
- Изменить `backend/src/cv_backend/app.py` для router registration и dependencies wiring.

**Интерфейсы:** `POST /api/v1/llm-connections` создаёт pending connection; `GET /api/v1/llm-connections` возвращает только безопасные DTO; `POST /api/v1/llm-connections/{id}/test` делает короткий тестовый запрос и выставляет status по фактическому результату. Успешная проверка не возвращает текст генерации пользователю как прикладной документ; только статус и безопасные provider/model metadata.

- [x] API тестами проверить создание/list/test, маскирование секрета, отказ cross-owner, недоступность в production без identity и непрозрачные upstream errors.
- [x] Запустить `pytest backend/tests/api/test_llm_connections.py -q`; ожидаемые отказы — отсутствуют маршруты и service.
- [x] Реализовать schemas, service, endpoints, транзакционную смену статуса и dependency wiring; destructive remove/deactivate endpoint не добавлять до решения Q-010.
- [x] Повторить API и связанные gateway/storage проверки; PASS, 14 тестов.

### Task 8: Интеграция gateway, полный regression и документация

**Файлы:**
- Создать `backend/tests/unit/test_llm_gateway_integration.py` и интеграционные тесты всех adapters через mocked transport.
- Обновить `docs/operations/backend.md`, `docs/architecture/system.md`, `docs/requirements/traceability.md`, `docs/governance/open-questions.md`, `docs/decisions/ADR-003-llm-provider-adapters.md`, `docs/progress.md`.

- [x] Проверить полный путь internal caller -> owner-scoped repository -> decrypt -> adapter -> normalized response; каждый provider тестируется без реальных ключей.
- [x] Запустить применимые backend tests; 120 passed (включая regressions по безопасности ответа валидации/логов, GigaChat default transport и transport stream errors/timeouts). `scripts/check_docs.py` прошёл через bundled Python: 20 зарегистрированных документов, 22 Markdown-файла, 265 локальных ссылок.
- [x] Убедиться, что migration проходит на чистой SQLite, credentials не появляются в ответах/логах, а API остаётся fail-closed без encryption key и production identity.
- [x] Обновить трассировку REQ-050–053 фактическими файлами и тестами; Q-010 остаётся открытым, удаление/деактивация не входят.
- [x] Выполнить `git diff --check`; проверка чистая, Git сообщил только о настройке LF→CRLF для отдельных существующих файлов.

## Самопроверка плана

- **Покрытие SPEC-006:** общий контракт — Task 1; шифрование — Task 2; owner storage — Task 3; OpenAI/OpenAI-compatible и SSRF — Task 4; YandexGPT — Task 5; GigaChat — Task 6; owner API/проверка — Task 7; gateway, errors, docs, traceability и production gates — Task 8.
- **Согласованность интерфейсов:** gateway принимает owner ID + connection ID; repository обеспечивает owner-filtered lookup; adapters получают только расшифрованную конфигурацию; API service использует тот же gateway для проверки.
- **Task 1 интерфейс:** repository синхронный, provider adapter асинхронный; credentials хранятся как JSON-объект строковых значений и gateway передает адаптеру расшифрованный `DecryptedLLMConnection`.
- **Граница объёма:** ни один task не добавляет UI, вакансии, логику резюме/писем или отправку откликов.
- **Нерешённое продуктовое решение:** Q-010 остаётся открытым; удаление/деактивация и обещания очистки резервных копий исключены из реализации до решения пользователя.
- **Ограничение production:** текущий `get_current_user_id` не обеспечивает production identity; integration тестируется с dependency override, а production API остаётся закрытым до отдельной реализации аутентификации.
- **Проверка полного набора:** backend suite — 120 passed; `scripts/check_docs.py` — 20 документов / 22 Markdown / 265 ссылок; `git diff --check` — exit 0.
