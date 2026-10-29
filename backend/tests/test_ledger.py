import json
import pytest
from fastapi.testclient import TestClient
from database import Base, SessionLocal, engine
from ledger import append_event, create_anchor, verify_against_anchors, verify_chain
from main import app
from models import Case, Department, Event, Ward
from seed import reset_seed_data


@pytest.fixture(scope="function")
def db_session():
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture(scope="function")
def client():
    with TestClient(app) as c:
        yield c


def test_chain_verifies_after_seeding(db_session):
    """
    Test 1: Chain verifies after seeding.
    """
    v_result = reset_seed_data(db_session)
    assert v_result["valid"] is True
    assert v_result["first_broken_sequence"] is None
    assert v_result["checked"] >= 30, f"Expected at least 30 blocks, got {v_result['checked']}"

    # Verify directly with verify_chain
    direct_verify = verify_chain(db_session)
    assert direct_verify["valid"] is True
    assert direct_verify["first_broken_sequence"] is None
    assert direct_verify["checked"] == v_result["checked"]


def test_editing_old_event_breaks_verification_at_exact_sequence(db_session):
    """
    Test 2: Editing any old event directly in the database breaks verification
    at exactly that sequence number.
    """
    reset_seed_data(db_session)

    target_seq = 15
    event = db_session.query(Event).filter(Event.sequence == target_seq).first()
    assert event is not None, f"Block #{target_seq} must exist in seed"

    # Maliciously mutate the payload without updating the hash chain
    event.payload = json.dumps({"unauthorized_tamper": "altered data without hash update"})
    db_session.commit()

    # Re-verify the chain
    v_result = verify_chain(db_session)
    assert v_result["valid"] is False
    assert v_result["first_broken_sequence"] == target_seq
    assert v_result["checked"] == target_seq - 1, f"Expected {target_seq - 1} valid blocks before break"


def test_deleting_event_breaks_verification(db_session):
    """
    Test 3: Deleting an event breaks the chain at sequence gap or prev_hash mismatch.
    """
    reset_seed_data(db_session)

    target_seq = 20
    event_to_delete = db_session.query(Event).filter(Event.sequence == target_seq).first()
    assert event_to_delete is not None

    db_session.delete(event_to_delete)
    db_session.commit()

    v_result = verify_chain(db_session)
    assert v_result["valid"] is False
    # Next event (seq 21) now creates a sequence gap or hash mismatch
    assert v_result["first_broken_sequence"] == 21


def test_anchor_mismatch_detected_when_chain_rewritten(db_session):
    """
    Test 4: An anchor mismatch is detected when an external anchor's head hash
    no longer matches the corresponding block in the ledger.
    """
    reset_seed_data(db_session)

    # Take a new anchor at current sequence
    anchor = create_anchor(db_session, notes="Snapshot anchor for rewrite test")
    assert anchor is not None

    # Corrupt the block that was anchored
    event = db_session.query(Event).filter(Event.sequence == anchor.sequence).first()
    event.own_hash = "f" * 64  # Fake rewritten hash
    db_session.commit()

    # Test verify_against_anchors
    a_result = verify_against_anchors(db_session)
    assert a_result["anchors_valid"] is False
    assert len(a_result["mismatches"]) > 0
    mismatch_seqs = [m["sequence"] for m in a_result["mismatches"]]
    assert anchor.sequence in mismatch_seqs


def test_reset_returns_exact_seed_state(db_session):
    """
    Test 5: Reset clears tampering and returns the exact valid seed state.
    """
    # First introduce a tamper
    event = db_session.query(Event).filter(Event.sequence == 8).first()
    if event:
        event.payload = json.dumps({"corrupted": True})
        db_session.commit()

    # Verify that it is tampered
    tampered_check = verify_chain(db_session)
    assert tampered_check["valid"] is False

    # Perform reset
    reset_result = reset_seed_data(db_session)
    assert reset_result["valid"] is True
    assert reset_result["first_broken_sequence"] is None
    assert reset_result["checked"] >= 100

    # Verify tables are fully populated
    assert db_session.query(Ward).count() == 3
    assert db_session.query(Department).count() == 3
    assert db_session.query(Case).count() >= 30


def test_api_endpoints(client):
    """
    Test 6: Integration test for API endpoints:
    - POST /api/launch
    - GET /api/ledger/verify
    - POST /api/demo/tamper
    - POST /api/demo/reset
    - GET /api/anchors
    """
    # 1. Launch endpoint
    res = client.post("/api/launch")
    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is True
    assert data["chain_valid"] is True
    assert data["total_blocks"] >= 30

    # 2. Verify endpoint
    res = client.get("/api/ledger/verify")
    assert res.status_code == 200
    assert res.json()["valid"] is True

    # 3. Tamper endpoint
    res = client.post("/api/demo/tamper", json={"sequence": 5})
    assert res.status_code == 200
    assert res.json()["ok"] is True
    assert res.json()["tampered_sequence"] == 5

    # 4. Verify detects tamper at sequence 5
    res = client.get("/api/ledger/verify")
    assert res.status_code == 200
    v_data = res.json()
    assert v_data["valid"] is False
    assert v_data["first_broken_sequence"] == 5

    # 5. Reset endpoint restores clean chain
    res = client.post("/api/demo/reset")
    assert res.status_code == 200
    assert res.json()["ok"] is True
    assert res.json()["chain_valid"] is True

    # 6. Verify again is valid
    res = client.get("/api/ledger/verify")
    assert res.status_code == 200
    assert res.json()["valid"] is True

    # 7. Anchors endpoint
    res = client.get("/api/anchors")
    assert res.status_code == 200
    a_data = res.json()
    assert len(a_data["anchors"]) >= 2
    assert a_data["verification"]["anchors_valid"] is True
