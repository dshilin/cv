import os
from secrets import token_bytes

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


_NONCE_BYTES = 12
_VERSION = b"\x01"
_ASSOCIATED_DATA = b"cv-backend-llm-credentials-v1"


class CredentialCipherError(ValueError):
    """Credential data cannot be authenticated or decoded."""


class CredentialCipher:
    def __init__(self, key: bytes) -> None:
        if len(key) != 32:
            raise ValueError("Credential encryption key must be exactly 32-byte")
        self._cipher = AESGCM(key)

    @classmethod
    def from_env(cls) -> "CredentialCipher":
        encoded_key = os.getenv("CV_LLM_ENCRYPTION_KEY")
        if encoded_key is None or len(encoded_key) != 64:
            raise RuntimeError("CV_LLM_ENCRYPTION_KEY must contain 64 hexadecimal characters")
        try:
            key = bytes.fromhex(encoded_key)
        except ValueError:
            raise RuntimeError(
                "CV_LLM_ENCRYPTION_KEY must contain 64 hexadecimal characters"
            ) from None
        if len(key) != 32:
            raise RuntimeError("CV_LLM_ENCRYPTION_KEY must decode to exactly 32 bytes")
        return cls(key)

    def encrypt(self, plaintext: bytes) -> bytes:
        nonce = token_bytes(_NONCE_BYTES)
        encrypted = self._cipher.encrypt(nonce, plaintext, _ASSOCIATED_DATA)
        return _VERSION + nonce + encrypted

    def decrypt(self, ciphertext: bytes) -> bytes:
        if len(ciphertext) < 1 + _NONCE_BYTES + 16 or ciphertext[:1] != _VERSION:
            raise CredentialCipherError("Credential ciphertext is invalid")
        nonce = ciphertext[1 : 1 + _NONCE_BYTES]
        encrypted = ciphertext[1 + _NONCE_BYTES :]
        try:
            return self._cipher.decrypt(nonce, encrypted, _ASSOCIATED_DATA)
        except InvalidTag:
            raise CredentialCipherError("Credential ciphertext is invalid") from None
