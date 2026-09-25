from uuid import UUID

from fastapi import HTTPException, status


def get_current_user_id() -> UUID:
    """Fail closed until an authentication provider is configured."""
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication is not configured",
    )
