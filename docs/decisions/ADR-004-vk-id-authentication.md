---
id: ADR-004
status: draft
version: 0.1
owner: Архитектор / backend-разработчик (роли; персональное назначение отсутствует)
approved_by: Не утверждено отдельно; реализация выполнена по прямому поручению пользователя «добавь vk авторизацию», чат 2026-09-28
last_reviewed: 2026-09-28
scope: Вход пользователей через VK ID и внутренняя backend session authentication
---

# ADR-004: Вход через VK ID

## Контекст

В backend профилей уже использовался только dev identity; production requests
закрывались 401. По поручению пользователя добавляется VK ID login и связанный
owner ID, который изолирует профили, черновики и LLM-подключения. В проектном
архитектурном ТЗ также упоминается Яндекс ID, но это поручение добавляет только
VK ID.

Официальный [VK ID Web SDK source](https://github.com/VKCOM/vkid-web-sdk/blob/master/src/auth/auth.ts)
и [API reference](https://vkcom.github.io/vkid-web-sdk/docs/classes/auth.Auth.html)
проверены 2026-09-28 (документация версии 2.6.1). SDK реализует OAuth 2.1
authorization code с PKCE S256; обмен передаёт `code`, `device_id`, `state`,
`code_verifier`, `client_id` и точный `redirect_uri`. VK возвращает access
token через серверный token endpoint, а user info запрашивается отдельно.

## Рассмотренные варианты

1. Оставить фиксированный development identity — не обеспечивает production
   аутентификацию и разделение владельцев.
2. Принимать VK access token в frontend API — создаёт bearer-token exposure и
   переносит доверие к непроверенному клиентскому значению.
3. Обменивать OAuth code на backend, проверять state, запрашивать user info и
   создавать отдельную внутреннюю серверную сессию.

## Решение

Выбран вариант 3. Backend создаёт случайные state и PKCE verifier, подписанно
хранит их в короткоживущей HttpOnly cookie и проверяет callback и token response
state. VK subject связывается с внутренним owner UUID. Для приложения выдаются
случайный 14-дневный HttpOnly/Secure session cookie и отдельный CSRF token;
в базе хранятся только SHA-256 hashes. VK access token не передаётся frontend
и не сохраняется после получения user info. Logout отзывает внутреннюю сессию
после CSRF validation. Без настроенного VK приложения вход fail-closed.

## Последствия и границы

- Требуются `VK_ID_APP_ID`, точный `VK_ID_REDIRECT_URI` и `CV_AUTH_STATE_SECRET`;
  callback в production использует HTTPS.
- Нужна миграция `20260928_0003_vk_auth_sessions`; исходные таблицы профилей
  остаются owner-scoped без изменений.
- Локальный dev identity сохраняется только за явными `CV_ENV=development` и
  `CV_DEV_USER_ID`.
- Яндекс ID, связывание нескольких provider identities с одним owner,
  восстановление доступа и управление/очистка истёкших sessions не входят.
- Live VK callback требует зарегистрированное приложение и не проверен в
  текущей среде.
