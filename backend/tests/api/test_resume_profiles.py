from uuid import uuid4
from io import BytesIO

from docx import Document


def test_user_can_create_and_list_multiple_profiles(client):
    first = client.post("/api/v1/profiles", json={"name": "AI Engineer"})
    second = client.post("/api/v1/profiles", json={"name": "QA Engineer"})
    assert first.status_code == 201
    assert second.status_code == 201
    listing = client.get("/api/v1/profiles")
    assert [profile["name"] for profile in listing.json()] == ["AI Engineer", "QA Engineer"]


def test_text_import_persists_only_reviewable_draft(client):
    response = client.post("/api/v1/resume-drafts/text", json={"text": "Навыки\nPython"})
    assert response.status_code == 201
    assert response.json()["state"] == "needs_user_review"
    assert response.json()["blocks"][0]["kind"] == "skills"
    assert client.get("/api/v1/candidate-base/items").json() == []


def test_profile_patch_does_not_change_another_profile(client):
    one = client.post("/api/v1/profiles", json={"name": "AI"}).json()
    two = client.post("/api/v1/profiles", json={"name": "QA"}).json()
    changed = client.patch(f"/api/v1/profiles/{one['id']}", json={"headline": "AI leader"})
    assert changed.status_code == 200
    untouched = client.get(f"/api/v1/profiles/{two['id']}")
    assert untouched.json()["headline"] is None


def test_unknown_profile_is_not_found(client):
    response = client.get(f"/api/v1/profiles/{uuid4()}")
    assert response.status_code == 404


def test_docx_import_creates_blocks_and_discards_original_upload(client):
    stream = BytesIO()
    document = Document()
    document.add_paragraph("Навыки")
    document.add_paragraph("Автоматизация")
    document.save(stream)
    response = client.post(
        "/api/v1/resume-drafts/file",
        files={"file": ("resume.docx", stream.getvalue(), "application/octet-stream")},
    )
    assert response.status_code == 201
    assert response.json()["blocks"][0]["text"] == "Автоматизация"
    assert "source_file" not in response.json()


def test_upload_rejects_mismatched_extension_and_bytes(client):
    response = client.post(
        "/api/v1/resume-drafts/file",
        files={"file": ("resume.pdf", b"PK not PDF", "application/pdf")},
    )
    assert response.status_code == 422


def test_upload_rejects_unsupported_extension_with_415(client, monkeypatch):
    response = client.post(
        "/api/v1/resume-drafts/file",
        files={"file": ("resume.doc", b"legacy format", "application/msword")},
    )
    assert response.status_code == 415


def test_upload_enforces_size_limit(client, monkeypatch):
    from cv_backend.api.routes import resume_drafts

    monkeypatch.setattr(resume_drafts, "MAX_UPLOAD_BYTES", 4)
    response = client.post(
        "/api/v1/resume-drafts/file",
        files={"file": ("resume.pdf", b"%PDF-1.4", "application/pdf")},
    )
    assert response.status_code == 413


def test_apply_idempotency_key_cannot_be_reused_for_another_block(client):
    imported = client.post(
        "/api/v1/resume-drafts/text", json={"text": "Навыки\nPython\nИнструменты\nGit"}
    ).json()
    first_block, second_block = imported["blocks"]
    payload = {"items": [{"kind": "skill", "name": "Python"}], "idempotency_key": "same-key"}
    first = client.post(
        f"/api/v1/resume-drafts/{imported['draft_id']}/blocks/{first_block['id']}/apply", json=payload
    )
    conflict = client.post(
        f"/api/v1/resume-drafts/{imported['draft_id']}/blocks/{second_block['id']}/apply", json=payload
    )
    assert first.status_code == 200
    assert conflict.status_code == 409
