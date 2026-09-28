import pytest
from pydantic import ValidationError

from cv_backend.llm.contracts import LLMMessage, LLMRequest, LLMResponse, LLMUsage


def test_llm_request_accepts_supported_roles_and_generation_parameters() -> None:
    request = LLMRequest(
        messages=[LLMMessage(role="user", content="Hello")],
        model="gpt-test",
        temperature=0.5,
        max_tokens=100,
    )

    assert request.messages[0].role == "user"
    assert request.model == "gpt-test"
    assert request.temperature == 0.5
    assert request.max_tokens == 100


@pytest.mark.parametrize(
    "messages,model,temperature,max_tokens",
    [
        ([], "gpt-test", None, None),
        ([{"role": "developer", "content": "No"}], "gpt-test", None, None),
        ([{"role": "user", "content": "Hi"}], "", None, None),
        ([{"role": "user", "content": "Hi"}], "gpt-test", -0.1, None),
        ([{"role": "user", "content": "Hi"}], "gpt-test", 2.1, None),
        ([{"role": "user", "content": "Hi"}], "gpt-test", None, 0),
    ],
)
def test_llm_request_rejects_invalid_fields(
    messages: list[dict[str, str]],
    model: str,
    temperature: float | None,
    max_tokens: int | None,
) -> None:
    with pytest.raises(ValidationError):
        LLMRequest(
            messages=messages,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
        )


def test_llm_response_allows_optional_usage() -> None:
    response = LLMResponse(
        text="Hello",
        provider="openai",
        model="gpt-test",
        usage=LLMUsage(input_tokens=3, output_tokens=2, total_tokens=5),
    )

    assert response.usage is not None
    assert response.usage.total_tokens == 5
