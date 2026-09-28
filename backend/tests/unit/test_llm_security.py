import pytest

from cv_backend.llm.security import CredentialCipher, CredentialCipherError


def test_credential_cipher_round_trips_with_random_nonce() -> None:
    cipher = CredentialCipher(bytes(range(32)))

    first = cipher.encrypt(b"api-key")
    second = cipher.encrypt(b"api-key")

    assert first != second
    assert cipher.decrypt(first) == b"api-key"
    assert cipher.decrypt(second) == b"api-key"
    assert b"api-key" not in first


def test_credential_cipher_rejects_wrong_key_and_tampered_data() -> None:
    encrypted = CredentialCipher(bytes(range(32))).encrypt(b"api-key")

    with pytest.raises(CredentialCipherError):
        CredentialCipher(bytes(reversed(range(32)))).decrypt(encrypted)

    tampered = encrypted[:-1] + bytes([encrypted[-1] ^ 1])
    with pytest.raises(CredentialCipherError):
        CredentialCipher(bytes(range(32))).decrypt(tampered)


def test_credential_cipher_rejects_malformed_key() -> None:
    with pytest.raises(ValueError, match="32-byte"):
        CredentialCipher(b"too short")


def test_credential_cipher_requires_a_64_character_hex_environment_key(monkeypatch) -> None:
    monkeypatch.delenv("CV_LLM_ENCRYPTION_KEY", raising=False)
    with pytest.raises(RuntimeError, match="CV_LLM_ENCRYPTION_KEY"):
        CredentialCipher.from_env()

    monkeypatch.setenv("CV_LLM_ENCRYPTION_KEY", "not-hex")
    with pytest.raises(RuntimeError, match="CV_LLM_ENCRYPTION_KEY"):
        CredentialCipher.from_env()

    monkeypatch.setenv("CV_LLM_ENCRYPTION_KEY", bytes(range(32)).hex())
    assert CredentialCipher.from_env().decrypt(
        CredentialCipher(bytes(range(32))).encrypt(b"ok")
    ) == b"ok"
