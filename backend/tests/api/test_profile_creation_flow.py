def test_end_to_end_profile_creation_keeps_drafts_user_controlled_and_profiles_independent(client):
    draft_response = client.post(
        "/api/v1/resume-drafts/text",
        json={"text": "Навыки\nPython\nИнструменты\nDocker"},
    )
    assert draft_response.status_code == 201
    draft = draft_response.json()
    skills_block, tools_block = draft["blocks"]
    assert client.get("/api/v1/candidate-base/items").json() == []

    edited = client.patch(
        f"/api/v1/resume-drafts/{draft['draft_id']}/blocks/{skills_block['id']}",
        json={"text": "Python — автоматизация"},
    )
    assert edited.status_code == 200

    skill_result = client.post(
        f"/api/v1/resume-drafts/{draft['draft_id']}/blocks/{skills_block['id']}/apply",
        json={"items": [{"kind": "skill", "name": "Python", "level": "advanced"}], "idempotency_key": "flow-skill"},
    )
    tool_result = client.post(
        f"/api/v1/resume-drafts/{draft['draft_id']}/blocks/{tools_block['id']}/apply",
        json={"items": [{"kind": "tool", "name": "Docker"}], "idempotency_key": "flow-tool"},
    )
    assert skill_result.status_code == tool_result.status_code == 200
    skill_id, tool_id = skill_result.json()[0]["id"], tool_result.json()[0]["id"]

    ai = client.post("/api/v1/profiles", json={"name": "AI Engineer"}).json()
    qa = client.post("/api/v1/profiles", json={"name": "QA Engineer"}).json()
    selected = client.put(
        f"/api/v1/profiles/{ai['id']}/selections",
        json={"skill_ids": [skill_id], "tool_ids": [tool_id]},
    )
    assert selected.status_code == 200
    assert selected.json()["skill_ids"] == [skill_id]
    assert selected.json()["tool_ids"] == [tool_id]
    assert client.patch(f"/api/v1/profiles/{ai['id']}", json={"headline": "AI Systems"}).status_code == 200
    assert client.get(f"/api/v1/profiles/{qa['id']}").json()["headline"] is None
