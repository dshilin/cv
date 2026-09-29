def test_confirming_same_contact_twice_does_not_create_duplicates(client):
    payload = {"kind": "contact", "label": "Email", "value": "person@example.com"}

    first = client.post("/api/v1/candidate-base/contacts", json=payload)
    second = client.post("/api/v1/candidate-base/contacts", json=payload)

    assert first.status_code == 201
    assert second.status_code == 200
    assert second.json()["id"] == first.json()["id"]
    assert client.get("/api/v1/candidate-base").json()["contacts"] == [first.json()]
