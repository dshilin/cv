from datetime import datetime, timedelta, timezone
import hashlib
import secrets
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from cv_backend.storage.models.auth import AuthIdentityModel, AuthSessionModel

SESSION_SECONDS = 60 * 60 * 24 * 14


def digest(value: str) -> bytes:
    return hashlib.sha256(value.encode("utf-8")).digest()


class AuthService:
    def __init__(self, session: Session):
        self.session = session

    def owner_for_vk_subject(self, subject: str) -> UUID:
        identity = self.session.scalar(select(AuthIdentityModel).where(
            AuthIdentityModel.provider == "vk_id", AuthIdentityModel.subject == subject
        ))
        if identity is None:
            identity_id = uuid4()
            identity = AuthIdentityModel(
                id=identity_id, owner_id=identity_id, provider="vk_id", subject=subject
            )
            self.session.add(identity)
            self.session.flush()
        return identity.owner_id

    def create_session(self, owner_id: UUID) -> tuple[str, str]:
        token, csrf_token = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
        self.session.add(AuthSessionModel(
            owner_id=owner_id, token_hash=digest(token), csrf_hash=digest(csrf_token),
            expires_at=datetime.now(timezone.utc) + timedelta(seconds=SESSION_SECONDS),
        ))
        self.session.commit()
        return token, csrf_token

    def owner_for_session(self, token: str) -> UUID | None:
        record = self.session.scalar(select(AuthSessionModel).where(
            AuthSessionModel.token_hash == digest(token),
            AuthSessionModel.expires_at > datetime.now(timezone.utc),
        ))
        return record.owner_id if record else None

    def csrf_matches(self, token: str, csrf_token: str) -> bool:
        record = self.session.scalar(select(AuthSessionModel).where(
            AuthSessionModel.token_hash == digest(token),
            AuthSessionModel.expires_at > datetime.now(timezone.utc),
        ))
        return bool(record and secrets.compare_digest(record.csrf_hash, digest(csrf_token)))

    def revoke_session(self, token: str) -> None:
        record = self.session.scalar(select(AuthSessionModel).where(AuthSessionModel.token_hash == digest(token)))
        if record:
            self.session.delete(record)
            self.session.commit()
