import datetime
import io
import os
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from database import Base, SessionLocal, engine, get_db
from ledger import verify_chain
from main import app
from models import Case, Department, Event, Notification, Setting, Ward
from seed import reset_seed_data, seed_database


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def db_session():
    db = SessionLocal()
    try:
        # Reset and seed database for pristine test environment
        reset_seed_data(db)
        yield db
    finally:
        db.close()


def create_dummy_jpeg(color=(120, 100, 80)):
    """Creates in-memory JPEG bytes for testing file uploads."""
    img = Image.new("RGB", (200, 200), color=color)
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


# ============================================================================
# 1. TEST SIMULATED OTP FLOW
# ============================================================================
def test_simulated_otp_flow(client: TestClient, db_session):
    phone = "+91-9876543210"

    # Request OTP
    res = client.post("/api/otp/request", json={"phone": phone})
    assert res.status_code == 200
    data = res.json()
    assert data["sent"] is True
    assert "demo_code" in data
    demo_code = data["demo_code"]

    # Verify notification outbox entry was recorded
    notification = (
        db_session.query(Notification)
        .filter(Notification.recipient_contact == phone)
        .order_by(Notification.sent_at.desc())
        .first()
    )
    assert notification is not None
    assert "SMS (simulated)" in notification.channel
    assert demo_code in notification.message

    # Verify OTP with wrong code -> 400
    res_bad = client.post("/api/otp/verify", json={"phone": phone, "code": "999999"})
    assert res_bad.status_code == 400

    # Verify OTP with valid code -> 200 & token
    res_good = client.post("/api/otp/verify", json={"phone": phone, "code": demo_code})
    assert res_good.status_code == 200
    token_data = res_good.json()
    assert token_data["ok"] is True
    assert "token" in token_data
    assert "sim_otp_" in token_data["token"]


# ============================================================================
# 2. TEST REPORT REJECTION FOR CLEAN / UNRELATED IMAGES
# ============================================================================
def test_report_rejection_clean_image(client: TestClient):
    clean_bytes = create_dummy_jpeg()
    # Sending filename with 'clean' keyword triggers deterministic clean mock
    files = {"photo": ("clean_street.jpg", clean_bytes, "image/jpeg")}
    data = {
        "lat": "28.4095",
        "lng": "77.3180",
        "description": "Clear street view",
    }
    res = client.post("/api/reports", files=files, data=data)
    assert res.status_code == 400
    err = res.json()
    assert "NO_DEFECT_DETECTED" in str(err)


# ============================================================================
# 3. TEST REPORT SUBMISSION & CONTRACTOR LIABILITY
# ============================================================================
def test_report_submission_with_contractor_liability(client: TestClient, db_session):
    # Sector 14 Main Commercial Avenue is at 28.4095, 77.3180
    # Its contract was completed June 2026 (active 24-month defect liability in Oct 2026)
    # We submit at 28.4100, 77.3180 (~55m away from CAS-8901 to ensure a new case is created)
    pothole_bytes = create_dummy_jpeg(color=(60, 50, 40))
    files = {"photo": ("pothole_crater_main.jpg", pothole_bytes, "image/jpeg")}
    data = {
        "lat": "28.4100",
        "lng": "77.3180",
        "description": "Severe pothole near market sector 14",
    }

    res = client.post("/api/reports", files=files, data=data)
    assert res.status_code == 200
    report_data = res.json()

    assert report_data["ok"] is True
    assert report_data.get("merged_as_duplicate") is not True
    case_id = report_data["case_id"]
    assert case_id.startswith("CAS-")
    assert report_data["detection"]["type"] == "pothole"
    assert report_data["severity"] in ["High", "Medium"]
    assert report_data["department"] == "PWD_ROADS"
    # CONTRACTOR LIABILITY must be flagged True!
    assert report_data["contract_liability"] is True
    assert "tracking_token" in report_data
    assert "due_acknowledge_at" in report_data["deadlines"]

    # Verify ledger events appended: REPORTED, AI_VERIFIED, ASSIGNED
    events = (
        db_session.query(Event)
        .filter(Event.case_id == case_id)
        .order_by(Event.sequence.asc())
        .all()
    )
    event_types = [e.event_type for e in events]
    assert "REPORTED" in event_types
    assert "AI_VERIFIED" in event_types
    assert "ASSIGNED" in event_types


# ============================================================================
# 4. TEST DUPLICATE MERGING WITHIN 30 METERS
# ============================================================================
def test_duplicate_report_merges_within_30m(client: TestClient, db_session):
    # Submit a second pothole report ~13 meters away from 28.4100, 77.3180
    lat_nearby = 28.4100 + 0.00012
    lng_nearby = 77.3180

    pothole_bytes = create_dummy_jpeg()
    files = {"photo": ("pothole_dup.jpg", pothole_bytes, "image/jpeg")}
    data = {
        "lat": str(lat_nearby),
        "lng": str(lng_nearby),
        "description": "Another report of the same pothole cluster",
    }

    res = client.post("/api/reports", files=files, data=data)
    assert res.status_code == 200
    dup_data = res.json()

    # Must be merged into open case
    assert dup_data["merged_as_duplicate"] is True
    assert dup_data["distance_m"] < 30.0
    assert dup_data["supporting_count"] >= 1

    # Verify SUPPORTING_REPORT_ADDED event in ledger
    dup_case_id = dup_data["case_id"]
    sup_event = (
        db_session.query(Event)
        .filter(
            Event.case_id == dup_case_id,
            Event.event_type == "SUPPORTING_REPORT_ADDED",
        )
        .first()
    )
    assert sup_event is not None


# ============================================================================
# 5. TEST ADVANCING CLOCK & DEADLINE AUTO-ESCALATION
# ============================================================================
def test_clock_advance_and_escalation_flow(client: TestClient, db_session):
    # Create an unacknowledged High-severity case
    # High severity has acknowledge deadline of 4 hours
    clock_res = client.get("/api/clock")
    assert clock_res.status_code == 200
    init_time = clock_res.json()["sim_now"]

    pothole_bytes = create_dummy_jpeg()
    files = {"photo": ("pothole_urgent.jpg", pothole_bytes, "image/jpeg")}
    # Use Ward 16 location far away from previous
    data = {
        "lat": "28.4250",
        "lng": "77.3360",
        "description": "Major road crater needing urgent fix",
    }
    rep_res = client.post("/api/reports", files=files, data=data)
    assert rep_res.status_code == 200
    case_id = rep_res.json()["case_id"]

    # Verify initial case state is L1
    case_obj = db_session.query(Case).filter(Case.id == case_id).first()
    assert case_obj.current_escalation_level == "L1"
    assert case_obj.status == "Assigned"

    # Advance clock by 5 hours (breaches 4h acknowledgement SLA)
    adv_res = client.post("/api/demo/advance", json={"hours": 5.0})
    assert adv_res.status_code == 200
    adv_data = adv_res.json()
    assert adv_data["ok"] is True
    assert adv_data["escalations_triggered"] >= 1

    # Verify case has auto-escalated to L2!
    db_session.refresh(case_obj)
    assert case_obj.current_escalation_level == "L2"
    assert "Escalated" in case_obj.status

    # Verify ledger event ESCALATED_L1 was recorded
    esc_event = (
        db_session.query(Event)
        .filter(Event.case_id == case_id, Event.event_type == "ESCALATED_L1")
        .first()
    )
    assert esc_event is not None

    # Advance clock by another 26 hours (breaches 24h L2 SLA)
    adv_res2 = client.post("/api/demo/advance", json={"hours": 26.0})
    assert adv_res2.status_code == 200

    # Verify case escalated to L3
    db_session.refresh(case_obj)
    assert case_obj.current_escalation_level == "L3"
    assert case_obj.status == "Escalated_L2"


# ============================================================================
# 6. TEST OFFICER ACTIONS & TIMELINE
# ============================================================================
def test_officer_actions_and_timeline(client: TestClient, db_session):
    # Find any active case
    c = db_session.query(Case).filter(Case.status == "Assigned").first()
    if not c:
        c = db_session.query(Case).first()

    # 1. Acknowledge
    ack_res = client.post(f"/api/cases/{c.id}/acknowledge")
    assert ack_res.status_code == 200
    assert ack_res.json()["status"] == "Acknowledged"

    # 2. Timeline
    timeline_res = client.get(f"/api/cases/{c.id}/timeline")
    assert timeline_res.status_code == 200
    t_data = timeline_res.json()
    assert "steps" in t_data
    assert len(t_data["steps"]) == 7
    step_names = [s["name_en"] for s in t_data["steps"]]
    assert "Reported" in step_names
    assert "Checked by AI" in step_names
    assert "Assigned" in step_names
    assert "Seen by officer" in step_names
    assert "Being fixed" in step_names
    assert "Fixed and checked" in step_names
    assert "Confirmed" in step_names
    assert "time_left_en" in t_data
    assert "time_left_hi" in t_data

    # 3. Reassign
    other_dept = (
        db_session.query(Department)
        .filter(Department.id != c.department_id)
        .first()
    )
    reassign_res = client.post(
        f"/api/cases/{c.id}/reassign",
        json={"department_id": other_dept.id, "reason": "Jurisdiction handoff"},
    )
    assert reassign_res.status_code == 200
    assert reassign_res.json()["department_id"] == other_dept.id

    # 4. Override Detection
    override_res = client.post(
        f"/api/cases/{c.id}/override-detection",
        json={
            "defect_type": "waterlogging",
            "severity": "Low",
            "reason": "Field inspection confirmed minor drainage stagnation",
        },
    )
    assert override_res.status_code == 200
    assert override_res.json()["defect_type"] == "waterlogging"
    assert override_res.json()["severity"] == "Low"


# ============================================================================
# 7. TEST SCORECARDS COMPUTATION
# ============================================================================
def test_department_scorecards_computation(client: TestClient):
    res = client.get("/api/scorecards")
    assert res.status_code == 200
    data = res.json()
    assert "scorecards" in data
    cards = data["scorecards"]
    assert len(cards) >= 3

    for card in cards:
        assert "department_name" in card
        assert "contractor_firm" in card
        assert "median_ack_hours" in card
        assert "median_resolve_days" in card
        assert "escalation_rate_pct" in card
        assert "reopen_rate_pct" in card
        assert "rejected_closure_rate_pct" in card
        assert "letter_grade" in card
        assert "Grade" in card["letter_grade"]


# ============================================================================
# 8. TEST CITIZEN REOPEN, TRACKING & PREVIEW ENDPOINTS
# ============================================================================
def test_reopen_and_tracking_endpoints(client: TestClient, db_session):
    # Find any existing case
    c = db_session.query(Case).first()
    assert c is not None

    # 1. Preview detector
    dummy_bytes = create_dummy_jpeg()
    files = {"photo": ("pothole_preview.jpg", dummy_bytes, "image/jpeg")}
    prev_res = client.post("/api/detector/preview", files=files)
    assert prev_res.status_code == 200
    prev_data = prev_res.json()
    assert prev_data["ok"] is True
    assert "detection" in prev_data

    # 2. Location lookup
    loc_res = client.get("/api/location/lookup?lat=28.4095&lng=77.3180")
    assert loc_res.status_code == 200
    loc_data = loc_res.json()
    assert loc_data["ok"] is True
    assert "Sector 14" in loc_data["address"]

    # 3. Track case
    track_res = client.get(f"/api/track/{c.id}")
    assert track_res.status_code == 200
    track_data = track_res.json()
    assert track_data["ok"] is True
    assert track_data["case_id"] == c.id
    assert "timeline" in track_data
    assert len(track_data["timeline"]["steps"]) == 7

    # 4. Reopen case
    reopen_res = client.post(f"/api/cases/{c.id}/reopen")
    assert reopen_res.status_code == 200
    reopen_data = reopen_res.json()
    assert reopen_data["ok"] is True
    assert reopen_data["status"] == "Reopened"
    assert reopen_data["current_escalation_level"] == "L2"


# ============================================================================
# 9. TEST CRYPTOGRAPHIC LEDGER CHAIN INTEGRITY AFTER ALL ACTIONS
# ============================================================================
def test_ledger_chain_integrity_after_workflow(db_session):
    verification = verify_chain(db_session)
    assert verification["valid"] is True
    assert verification["checked"] > 120
    assert verification["first_broken_sequence"] is None
