---
id: ADR-003
status: draft
version: 0.4
owner: Архитектор / владелец продукта (роли; назначение отсутствует)
approved_by: Основание — решение пользователя в чате 2026-09-28; ADR ожидает review письменной спецификации
last_reviewed: 2026-09-29
scope: Backend LLM API providers, adapters and ownership of credentials
---

# ADR-003: Провайдер-независимая интеграция LLM

## Контекст

Backend должен уметь подключаться к API LLM-провайдеров. Пользователь
отказался от обязательной зависимости от готового веб-сервиса CV Maker и
выбрал OpenAI/OpenAI-compatible API, YandexGPT и GigaChat. Каждый пользователь
подключает собственные учётные данные. Функции для подготовки документов под
вакансию относятся к отдельной задаче.

OpenAI-совместимость не означает одинаковую аутентификацию и полный набор
функций. Yandex AI Studio принимает OpenAI SDK Chat Completions; для API key
используются `Authorization: Api-Key`, `OpenAI-Project` с folder ID и модель
в URI `gpt://<folder-id>/<model>`. GigaChat документирует частичную
совместимость с OpenAI SDK и использует отдельный обмен ключа авторизации на
короткоживущий bearer token через `/api/v2/oauth`; completions endpoint —
`https://api.giga.chat/v1`. Для token exchange нужны уникальный `RqUID` и
scope `GIGACHAT_API_PERS`, `GIGACHAT_API_B2B` или `GIGACHAT_API_CORP`; токен
действует 30 минут.

## Рассмотренные варианты

1. Один generic OpenAI-compatible HTTP клиент для всех провайдеров.
2. Независимые реализации backend-вызова для каждого provider.
3. Единый внутренний контракт текстового completion, generic OpenAI-compatible адаптер и
   provider-specific адаптеры для YandexGPT и GigaChat.

## Решение

Выбран вариант 3. Общими остаются управление вызовом LLM и нормализация
результата/ошибок. Адаптер отвечает за запрос/ответ, авторизацию, модельный
идентификатор и особенности API. Формирование прикладных задач, документов и
их проверка не входят в этот backend integration слой.

API credentials предоставляет и выбирает сам пользователь. Секреты
owner-scoped, сохраняются только сервером в зашифрованном виде, не попадают в
логи и не возвращаются клиенту. До production многопользовательского запуска
необходима реальная user authentication; dev identity недостаточна.

У пользователя может быть несколько сохранённых подключений и моделей.
Gateway предоставляет внутренний интерфейс backend-модулям; конкретный
прикладной сценарий генерации подключается в отдельной задаче.

## Основание и дата

Решение пользователя в чате от 2026-09-28: использовать API-интеграцию вместо
обязательной зависимости от готового веб-сервиса CV Maker; поддержать
OpenAI-совместимый формат, YandexGPT и GigaChat; каждый пользователь подключает
собственные ключи. Основание
провайдерных различий перепроверено по официальной документации 2026-09-28:
  [OpenAI Chat Completions](https://platform.openai.com/docs/api-reference/chat/create),
[OpenAI API key safety](https://developers.openai.com/api/docs/guides/production-best-practices),
[Yandex Chat Completions](https://aistudio.yandex.ru/ru/docs/ai-studio/operations/generation/completions-basic),
[Yandex authentication](https://aistudio.yandex.ru/ru/docs/ai-studio/api-ref/authentication),
[GigaChat OpenAI compatibility](https://developers.sber.ru/docs/ru/gigachat/guides/compatible-openai),
[GigaChat authorization](https://developers.sber.ru/docs/ru/gigachat/api/reference/rest/gigachat-api),
[GigaChat access token](https://developers.sber.ru/docs/ru/gigachat/api/reference/rest/post-token).

## Последствия

- Q-001 закрыт выбором API-интеграции вместо обязательного использования
  готового веб-сервиса CV Maker.
- Настройки ключей требуют изоляции владельцев, шифрования и безопасного
  ввода/удаления секретов.
- Провайдерные различия остаются внутри адаптеров; функции за пределами
  общего текстового Chat Completions контракта не предполагаются.
- Пользователь оплачивает/контролирует доступ по тарифу выбранного API.
- Production-доступ нельзя включить до настройки реальной идентификации
  пользователя.
- Credentials шифруются AES-256-GCM через библиотеку Python `cryptography`;
  32-байтовый ключ передаётся из secret manager/окружения как 64 hex-символа,
  в ciphertext записываются версия формата, 12-байтовый nonce и ciphertext с
  authentication tag. AES-GCM выбран согласно [официальной документации
  cryptography](https://cryptography.io/en/49.0.0/hazmat/primitives/aead/),
  проверенной 2026-09-28; повторное использование nonce с тем же ключом
  недопустимо.
- OpenAI-compatible endpoints принимаются только по HTTPS; DNS-ответ целиком
  проверяется на публичные IP, а сетевое соединение закрепляется за выбранным
  проверенным IP при сохранении исходного hostname для TLS verification.
  Redirect отключён. Используются транспортные расширения HTTPX/httpcore;
  основание — [HTTPX custom transports](https://github.com/encode/httpx/blob/master/docs/advanced/transports.md)
  и [httpcore network backend](https://github.com/encode/httpcore/blob/master/httpcore/_backends/base.py),
  проверенные 2026-09-28.
- Хранение содержимого prompt/result для аудита остаётся Q-006; удаление
  секретов требует решения Q-010.

## Затронутые требования и документы

- SPEC-002, SPEC-006; REQ-050–REQ-053.
- Q-001 resolved; Q-006 открытый; Q-010 добавлен.

## Проверка

Документационная проверка после утверждения спецификации. Реализация и
проверки провайдеров не созданы.

## Заменяет / заменено

Заменяет прежнюю формулировку Q-001 от 2026-09-28 о готовом веб-сервисе CV
Maker и необходимости отложить backend-интеграцию в отдельную задачу.
