import asyncio
from dataclasses import dataclass
from uuid import UUID


@dataclass(frozen=True)
class AccessToken:
    value: str
    expires_at: float


class AccessTokenCache:
    def __init__(self, *, refresh_before_seconds: float = 60) -> None:
        self._refresh_before_seconds = refresh_before_seconds
        self._tokens: dict[UUID, AccessToken] = {}
        self._locks: dict[UUID, asyncio.Lock] = {}

    def get(self, connection_id: UUID, now: float) -> AccessToken | None:
        token = self._tokens.get(connection_id)
        if token is None or token.expires_at - now <= self._refresh_before_seconds:
            return None
        return token

    def set(self, connection_id: UUID, token: AccessToken) -> None:
        self._tokens[connection_id] = token

    def lock_for(self, connection_id: UUID) -> asyncio.Lock:
        return self._locks.setdefault(connection_id, asyncio.Lock())
