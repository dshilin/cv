---
id: SPEC-006
status: draft
version: 0.3
owner: Архитектор и владелец продукта (роли; персональное назначение отсутствует)
approved_by: Границы уточнены пользователем в чате 2026-09-28; письменная спецификация ожидает review
last_reviewed: 2026-09-28
scope: Backend-интеграция LLM API провайдеров и общий внутренний интерфейс
---

# Дизайн backend-интеграции LLM-провайдеров

## Назначение

Добавить в backend общий внутренний интерфейс для вызова языковых моделей и
адаптеры подключений OpenAI API / OpenAI-compatible API, YandexGPT и GigaChat.
Каждый пользователь подключает собственные credentials. Другие backend-модули
смогут независимо использовать этот интерфейс в отдельных задачах.

Эта спецификация описывает только backend-интеграцию провайдеров. Передача
вакансии, подготовка адаптированных резюме/писем, версии откликов, их UI и
отправка работодателю относятся к отдельным продуктовым задачам. Они не
являются критериями этой интеграции.

## Основание и границы

- Пользовательское решение в чате 2026-09-28: отказаться от кастомного GPT
  CV Maker в пользу API-интеграции; учитывать OpenAI-совместимый формат,
  YandexGPT и GigaChat.
- Пользовательское решение в чате 2026-09-28: каждый пользователь
  подключает собственные ключи.
- Уточнение пользователя в чате: интеграция LLM в backend и работа с
  вакансиями/документами — разные задачи; текущая задача ограничена backend.
- В текущем backend нет production-аутентификации. Хранилище подключений
  должно быть owner-scoped, но производственное многопользовательское
  использование запрещено до появления надёжной пользовательской identity.

### Входит в задачу

- Provider-neutral контракт текстового запроса/ответа для внутреннего вызова
  из backend.
- Прямой OpenAI API и generic OpenAI-compatible Chat Completions endpoint.
- Провайдерные адаптеры и схема credentials для Yandex AI Studio/YandexGPT и
  GigaChat.
- Owner-scoped backend API управления подключениями, проверка подключения и
  вызов тестовой генерации без прикладной логики резюме/вакансий.
- Шифрование секретов на backend, маскирование в диагностике и единая
  нормализация ошибок/метаданных ответа.

### Не входит в задачу

- Любые frontend-экраны или UX подключения провайдера.
- Выбор/ввод вакансии, промпт адаптации резюме, сопроводительное письмо,
  fact guard документов, версии отклика, copy/export и отправка.
- Специальная аутентификация пользователей через Yandex ID или VK ID.
- Эмбеддинги, изображения, audio, tools/function calling, streaming, batch,
  Responses API и fallback между поставщиками.

## Рассмотренные варианты

1. Один универсальный OpenAI-compatible клиент. Прост, но не выражает различия
   аутентификации и параметров конкретных поставщиков.
2. Полностью отдельные реализации каждого провайдера. Точно учитывают API,
   но дублируют общий цикл вызова и нормализацию результата.
3. Общий внутренний контракт плюс OpenAI-compatible адаптер и provider-specific
   адаптеры/настройки для YandexGPT и GigaChat. Выбранный вариант отделяет
   общую серверную логику от особенностей протоколов и credentials.

## Backend-архитектура

```text
FastAPI owner-scoped routes
  ├── LLM Connection Service
  │     ├── validate/test connection
  │     └── encrypt and retrieve owner credentials
  └── LLM Gateway (internal service interface)
        ├── normalized text request/response
        ├── OpenAI / OpenAI-compatible adapter
        ├── Yandex AI Studio adapter
        └── GigaChat adapter
```

API-слой разрешает подключение и вызов только в контексте владельца. Gateway
получает owner-scoped connection ID, модель, список role/content сообщений и
общие параметры текста; возвращает текст, использованную модель, usage при
наличии и нормализованный статус. Секреты не передаются из service layer в
прикладные функции и не включаются в DTO ответа.

### Провайдеры и credentials

- **OpenAI:** официальный API endpoint, модель и API key пользователя. Для
  текущего Chat Completions API provider adapter передаёт общий лимит
  `max_tokens` в API-поле `max_completion_tokens`.
- **OpenAI-compatible:** HTTPS base URL, идентификатор модели и API key.
  Произвольные URL ограничиваются HTTPS; запрещаются loopback, private и
  link-local адреса и небезопасные перенаправления, чтобы закрыть SSRF.
- **Yandex AI Studio/YandexGPT:** API key сервисного аккаунта, folder ID и
  model URI. Базовый URL `https://ai.api.cloud.yandex.net/v1`; используются
  `Authorization: Api-Key` и `OpenAI-Project`. Model path преобразуется в
  `gpt://<folder-id>/<model>`. IAM-токен как отдельный способ credentials не
  включён в начальную реализацию.
- **GigaChat:** ключ авторизации и scope (`PERS`, `B2B` или `CORP`). Адаптер
  получает access token через `https://ngw.devices.sberbank.ru:9443/api/v2/oauth`
  с `RqUID`, кэширует его только в памяти до срока действия и вызывает
  `https://api.giga.chat/v1/chat/completions`. Для token exchange используются
  scope `GIGACHAT_API_PERS`, `GIGACHAT_API_B2B` или `GIGACHAT_API_CORP`.
  Начальный контракт использует только базовые поля Chat Completions,
  совместимые с целевой моделью.

Пользователь может хранить несколько подключений. Подключение содержит
поставщика, необходимые публичные параметры, зашифрованные credentials,
модель по умолчанию и статус проверки. Секрет показывается только при вводе;
после сохранения API возвращает только безопасную метаинформацию. Отключённое
или не прошедшее проверку подключение использовать нельзя.

Ключ шифрования предоставляется сервером через защищённую конфигурацию или
secret manager. API keys и access tokens запрещено записывать в application
logs, traces и тексты ошибок. Точная политика удаления зашифрованного секрета
при отключении подключения остаётся Q-010.

### Нормализованный контракт

Первый релиз поддерживает синхронную текстовую генерацию по role/content
messages, `model`, `temperature` и ограничению токенов. Gateway нормализует
текст ответа, provider/model ID, usage и ошибки. Поставщик не меняет общую
бизнес-логику вызывающего backend-модуля. Если провайдер не поддерживает
переданное поле или возвращает несовместимый ответ, вызов завершается
понятной ошибкой; скрытого перехода к другому провайдеру нет.

Chat Completions выбран как общий текстовый протокол для первого объёма.
Responses API, несмотря на рекомендацию OpenAI для новых приложений, не
входит в этот общий знаменатель: поддержка функций каждого поставщика
проверяется отдельно и добавляется отдельным решением.

### Ошибки и наблюдаемость

- Единые категории: недействительные credentials, недоступная модель,
  превышенная квота, rate limit, timeout, provider 5xx и невалидный ответ.
- Ограниченный timeout; повторять можно только временные ошибки с backoff.
- Повтор не выполняется при недействительных credentials, невалидных
  параметрах или неизвестной модели.
- Диагностика содержит provider/model ID, категорию и correlation ID, но не
  ключи, prompts, сообщения или полный ответ.
- Backend предоставляет command для проверки подключения на тестовом
  коротком запросе; содержимое реального профиля/вакансии не требуется.

## Критерии проверки дизайна

1. Backend caller использует единый типизированный интерфейс для текстовой
   генерации независимо от провайдера.
2. Отдельно поддерживаются OpenAI, произвольный OpenAI-compatible endpoint,
   YandexGPT и GigaChat с корректными полями настроек/авторизации.
3. Connections и credentials изолированы по owner ID; другой владелец не
   может проверить, вызвать, прочитать или изменить подключение.
4. Секреты шифруются в хранилище, маскируются в ответах и отсутствуют в
   логах/ошибках.
5. Успешный вызов нормализует текст, provider/model ID, usage при наличии;
   типовые ошибки провайдера нормализованы.
6. Невалидное/непроверенное подключение не вызывает модель; автоматического
   перехода к другому provider нет.
7. Код не содержит frontend и логики вакансии, резюме, письма или отклика.
8. До production-многопользовательского запуска backend получает реальную
   identity; локальный dev owner не считается достаточной аутентификацией.

## Открытые вопросы

- Q-006: состав и хранение аудита LLM-вызовов.
- Q-010: окончательная семантика удаления/деактивации сохранённого секрета и
  его копий в резервных копиях.
- Production identity: аутентификация пользователей пока не реализована;
  owner scoping для тестовой/dev среды не разрешает публичный запуск.

## Внешняя документация

Проверено 2026-09-28; провайдерные endpoint/auth поля перепроверены при
реализации 2026-09-28:

- [OpenAI Chat Completions](https://platform.openai.com/docs/api-reference/chat/create) — общий текстовый интерфейс; OpenAI рекомендует Responses API для новых приложений.
- [OpenAI API key safety](https://developers.openai.com/api/docs/guides/production-best-practices) — безопасное хранение ключей.
- [Yandex AI Studio: базовый Chat Completions запрос](https://aistudio.yandex.ru/ru/docs/ai-studio/operations/generation/completions-basic) — endpoint, `Authorization: Api-Key`, `OpenAI-Project`, model URI и параметры текста.
- [Yandex AI Studio: аутентификация](https://aistudio.yandex.ru/ru/docs/ai-studio/api-ref/authentication) — API key и IAM token.
- [GigaChat: совместимость с OpenAI](https://developers.sber.ru/docs/ru/gigachat/guides/compatible-openai) — Chat Completions и ограничения совместимости.
- [GigaChat: авторизация](https://developers.sber.ru/docs/ru/gigachat/api/reference/rest/gigachat-api) — целевой completion endpoint, scope, RqUID и 30-минутный access token.
- [GigaChat: получение access token](https://developers.sber.ru/docs/ru/gigachat/api/reference/rest/post-token) — обмен auth key на access token.
