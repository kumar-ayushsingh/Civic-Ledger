import io
import json
import sys
import httpx
from PIL import Image

sys.stdout.reconfigure(encoding='utf-8')

BASE_URL = "http://127.0.0.1:8000"


def make_dummy_jpeg():
    img = Image.new("RGB", (150, 150), color=(70, 60, 50))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


def run_demo():
    print("=== CIVICLEDGER WORKFLOW ENGINE DEMO ===")
    client = httpx.Client(base_url=BASE_URL, timeout=30.0)

    # 1. Reset pristine state
    print("\n1. Resetting database to clean seed state...")
    r = client.post("/api/demo/reset")
    assert r.status_code == 200, r.text
    print(f"   -> Reset OK. Blocks verified: {r.json()['total_blocks']}")

    # 2. OTP Request & Verify
    print("\n2. Requesting Simulated OTP for citizen...")
    phone = "+91-9876543210"
    r = client.post("/api/otp/request", json={"phone": phone})
    assert r.status_code == 200, r.text
    demo_code = r.json()["demo_code"]
    print(f"   -> OTP code generated & outbox logged: {demo_code}")

    r = client.post("/api/otp/verify", json={"phone": phone, "code": demo_code})
    assert r.status_code == 200, r.text
    token = r.json()["token"]
    print(f"   -> OTP verified! Auth token: {token[:25]}...")

    # 3. Submit Report with Contractor Liability
    print("\n3. Submitting citizen defect report with photo...")
    img_bytes = make_dummy_jpeg()
    files = {"photo": ("pothole_sector14.jpg", img_bytes, "image/jpeg")}
    data = {
        "lat": "28.4100",
        "lng": "77.3180",
        "description": "Deep asphalt pothole near Sector 14 Commercial Axis",
        "otp_token": token,
    }
    r = client.post("/api/reports", files=files, data=data)
    assert r.status_code == 200, r.text
    rep = r.json()
    case_id = rep["case_id"]
    print(f"   -> Report accepted! Case ID: {case_id}")
    print(f"   -> AI Detection: {rep['detection']['type']} (confidence {rep['detection']['confidence']})")
    print(f"   -> Severity: {rep['severity']}")
    print(f"   -> Department Assigned: {rep['department_name']} ({rep['department']})")
    print(f"   -> Contractor Liability Flag: {rep['contract_liability']}")
    print(f"   -> Acknowledge Deadline: {rep['deadlines']['due_acknowledge_at']}")

    # 4. Duplicate Check
    print("\n4. Submitting duplicate report within 14m...")
    files_dup = {"photo": ("pothole_dup.jpg", img_bytes, "image/jpeg")}
    data_dup = {
        "lat": "28.4101",
        "lng": "77.3180",
        "description": "Neighbor reporting the same pothole",
        "otp_token": token,
    }
    r = client.post("/api/reports", files=files_dup, data=data_dup)
    assert r.status_code == 200, r.text
    dup = r.json()
    print(f"   -> Duplicate detected: {dup['merged_as_duplicate']} (distance {dup['distance_m']}m)")
    print(f"   -> Merged into Case #{dup['case_id']}, total supporting: {dup['supporting_count']}")

    # 5. Advance Time & Trigger Auto-Escalation
    print("\n5. Advancing simulated clock by 26 hours (breaches 24h Ack SLA)...")
    r = client.post("/api/demo/advance", json={"hours": 26.0})
    assert r.status_code == 200, r.text
    adv = r.json()
    print(f"   -> Advanced by {adv['advanced_hours']}h. New Sim Time: {adv['sim_now']}")
    print(f"   -> Escalations triggered: {adv['escalations_triggered']}")

    # Check case status
    r = client.get(f"/api/cases/{case_id}")
    assert r.status_code == 200, r.text
    c_info = r.json()
    print(f"   -> Case #{case_id} Status: {c_info['status']} | Level: {c_info['current_escalation_level']}")
    assert c_info['current_escalation_level'] == 'L2'

    # 6. Timeline View (English & Hindi)
    print("\n6. Fetching plain-language Case Timeline...")
    r = client.get(f"/api/cases/{case_id}/timeline")
    assert r.status_code == 200, r.text
    tl = r.json()
    print(f"   -> Current Holder (EN): {tl['current_holder_en']}")
    print(f"   -> Current Holder (HI): {tl['current_holder_hi']}")
    print(f"   -> Time Left (EN): {tl['time_left_en']}")
    print(f"   -> Time Left (HI): {tl['time_left_hi']}")
    print(f"   -> Steps Count: {len(tl['steps'])}")
    for s in tl["steps"]:
        print(f"      [{s['status'].upper():9}] #{s['sequence']} {s['name_en']} ({s['name_hi']})")

    # 7. Officer Acknowledge Action
    print(f"\n7. Field Officer acknowledging Case #{case_id}...")
    r = client.post(f"/api/cases/{case_id}/acknowledge")
    assert r.status_code == 200, r.text
    print(f"   -> Acknowledged OK. New Status: {r.json()['status']}")

    # 8. Department Scorecards
    print("\n8. Fetching Department Scorecards...")
    r = client.get("/api/scorecards")
    assert r.status_code == 200, r.text
    cards = r.json()["scorecards"]
    for sc in cards:
        print(f"   - {sc['department_name']}: {sc['grade']} | Avg Speed: {sc['median_resolve_days']}d | Escalation: {sc['escalation_rate_pct']}% | Contractor: {sc['contractor_firm']}")

    # 9. Verify Ledger Chain
    print("\n9. Verifying SHA-256 Ledger Chain integrity...")
    r = client.get("/api/ledger/verify")
    assert r.status_code == 200, r.text
    v = r.json()
    print(f"   -> Chain Valid: {v['valid']} | Blocks Checked: {v['checked']} | Broken Sequence: {v['first_broken_sequence']}")
    assert v["valid"] is True

    print("\n=== DEMO FLOW COMPLETED SUCCESSFULLY! ALL CHECKS PASSED. ===")


if __name__ == "__main__":
    run_demo()
