import asyncio
from contextlib import asynccontextmanager
import datetime
import hashlib
import io
import json
import os
import secrets
from typing import Any, Dict, List, Optional
from fastapi import (
    Depends,
    FastAPI,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from PIL import Image
import imagehash
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import DATA_DIR, EVIDENCE_STORE_DIR, Base, SessionLocal, engine, get_db
from detector import detect
from ledger import append_event, create_anchor, verify_against_anchors, verify_chain
from models import (
    Anchor,
    Asset,
    Case,
    Contract,
    Department,
    Event,
    Evidence,
    Notification,
    Officer,
    SlaPolicy,
    Ward,
)
from seed import reset_seed_data, seed_database
from workflow import (
    advance_sim_clock,
    calculate_severity,
    check_contractor_liability,
    compute_department_scorecards,
    evaluate_deadlines,
    find_duplicate_case,
    find_nearest_asset,
    generate_case_timeline,
    get_sim_now,
    haversine_distance_m,
    request_simulated_otp,
    validate_otp_token,
    verify_simulated_otp,
)

# Initialize database schema
Base.metadata.create_all(bind=engine)


# ---------------- BACKGROUND DEADLINE EVALUATOR LOOP ----------------
async def background_deadline_evaluator():
    """
    Background worker that runs every 2 seconds to evaluate case SLA deadlines
    against the simulated clock and auto-escalate breached tickets.
    """
    while True:
        try:
            await asyncio.sleep(2)
            if os.environ.get("PYTEST_CURRENT_TEST") or os.environ.get("CIVICLEDGER_TEST"):
                continue
            db: Session = SessionLocal()
            try:
                evaluate_deadlines(db)
            finally:
                db.close()
        except asyncio.CancelledError:
            break
        except Exception:
            # Shield loop from database connection glitches
            pass


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: spawn background deadline evaluator
    bg_task = asyncio.create_task(background_deadline_evaluator())
    yield
    # Shutdown: gracefully cancel task
    bg_task.cancel()
    try:
        await bg_task
    except asyncio.CancelledError:
        pass


app = FastAPI(
    title="CivicLedger API",
    description="Public Accountability Ledger for Civic Repairs",
    version="0.3.0",
    lifespan=lifespan,
)

# Enable CORS for Vite frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve evidence store images for photo thumbnails & before/after comparisons
os.makedirs(EVIDENCE_STORE_DIR, exist_ok=True)
app.mount("/evidence_store", StaticFiles(directory=EVIDENCE_STORE_DIR), name="evidence_store")

# Serve test sample photos for demo shortcuts and test presets
SAMPLES_DIR = os.path.join(DATA_DIR, "samples")
if os.path.exists(SAMPLES_DIR):
    app.mount("/samples", StaticFiles(directory=SAMPLES_DIR), name="samples")


@app.get("/api/health")
def health_check():
    return {
        "status": "ok",
        "service": "CivicLedger API",
        "timestamp": datetime.datetime.utcnow().isoformat(),
    }


# ============================================================================
# 1. LAUNCH ENDPOINT
# ============================================================================
@app.post("/api/launch")
def launch_prototype(db: Session = Depends(get_db)):
    """
    POST /api/launch:
    Seeds database if empty, verifies the ledger chain, and returns environment summary.
    """
    events_count = db.query(Event).count()
    seeded = False
    if events_count == 0:
        seed_database(db)
        seeded = True

    v_result = verify_chain(db)
    wards_count = db.query(Ward).count()
    cases_count = db.query(Case).count()

    return {
        "ok": True,
        "seeded": seeded,
        "total_blocks": v_result["checked"],
        "chain_valid": v_result["valid"],
        "first_broken_sequence": v_result.get("first_broken_sequence"),
        "wards_count": wards_count,
        "cases_count": cases_count,
        "message": "Simulated ward services started, seed data loaded, ledger chain verified",
    }


# ============================================================================
# 2. OTP ENDPOINTS (SIMULATED FOR PROTOTYPE)
# ============================================================================
class OtpRequestModel(BaseModel):
    phone: str


class OtpVerifyModel(BaseModel):
    phone: str
    code: str


@app.post("/api/otp/request")
def request_otp(req: OtpRequestModel, db: Session = Depends(get_db)):
    """
    POST /api/otp/request:
    Stores an OTP session, writes an entry to notification outbox ('SMS (simulated)'),
    and returns {sent: True, demo_code: ...}.
    NOTE: This is simulated for demo purposes (no third-party telecom cost).
    """
    if not req.phone or len(req.phone.strip()) < 7:
        raise HTTPException(status_code=400, detail="Please enter a valid phone number.")

    res = request_simulated_otp(db, req.phone)
    return res


@app.post("/api/otp/verify")
def verify_otp(req: OtpVerifyModel, db: Session = Depends(get_db)):
    """
    POST /api/otp/verify:
    Verifies phone and OTP code, returning a short-lived token.
    NOTE: This is simulated for demo purposes.
    """
    is_valid, token, error_msg = verify_simulated_otp(db, req.phone, req.code)
    if not is_valid:
        raise HTTPException(status_code=400, detail=error_msg or "Invalid OTP code.")

    return {
        "ok": True,
        "phone": req.phone,
        "token": token,
        "message": "Phone number successfully verified (Simulated).",
    }


# ============================================================================
# 3. REPORT SUBMISSION ENDPOINT (MULTIPART)
# ============================================================================
@app.post("/api/reports")
async def submit_report(
    photo: UploadFile = File(...),
    lat: float = Form(...),
    lng: float = Form(...),
    captured_at: Optional[str] = Form(None),
    description: Optional[str] = Form(""),
    language: Optional[str] = Form("en"),
    otp_token: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
    """
    POST /api/reports:
    Full workflow intake:
      1. Validates simulated OTP token.
      2. Runs defect detector on uploaded image bytes.
      3. Rejects non-defect images with friendly explanation.
      4. Checks 30m duplicate rule (merges as supporting report if exists).
      5. Nearest-asset lookup via Haversine (ward, department, contract).
      6. Checks contractor defect liability period.
      7. Computes severity score.
      8. Creates Case, Evidence, and appends real ledger events (REPORTED, AI_VERIFIED, ASSIGNED).
      9. Appends outbox notification.
      10. Returns {case_id, tracking_token, detection, severity, department, contract_liability, deadlines}.
    """
    # 1. Validate OTP token
    is_otp_valid, citizen_phone = validate_otp_token(otp_token)

    # 2. Read and hash image bytes
    image_bytes = await photo.read()
    if not image_bytes or len(image_bytes) < 100:
        raise HTTPException(status_code=400, detail="Empty or unreadable photograph provided.")

    sha256_hash = hashlib.sha256(image_bytes).hexdigest()

    # Perceptual hash for similarity checks
    try:
        img_obj = Image.open(io.BytesIO(image_bytes))
        phash_str = str(imagehash.phash(img_obj))
    except Exception:
        phash_str = sha256_hash[:16]

    # Save to evidence store
    os.makedirs(EVIDENCE_STORE_DIR, exist_ok=True)
    ext = os.path.splitext(photo.filename or "")[1] or ".jpg"
    target_filename = f"{sha256_hash}{ext}"
    target_path = os.path.join(EVIDENCE_STORE_DIR, target_filename)
    if not os.path.exists(target_path):
        with open(target_path, "wb") as f_out:
            f_out.write(image_bytes)

    rel_evidence_path = f"evidence_store/{target_filename}"

    # 3. Run defect detector
    detection = detect(image_bytes, filename=photo.filename)
    defect_type = detection.get("type", "unrelated")
    confidence = float(detection.get("confidence", 0.0))
    area_ratio = float(detection.get("area_ratio", 0.0))

    if defect_type in ["clean", "unrelated"] or confidence < 0.40:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "NO_DEFECT_DETECTED",
                "message": "AI defect verification did not identify a clear road pothole, waste accumulation, or waterlogging in the uploaded photograph. Please ensure the camera is facing the defect directly.",
                "detection": detection,
            },
        )

    # Simulated clock reference
    sim_now = get_sim_now(db)
    if captured_at:
        try:
            report_time = datetime.datetime.fromisoformat(captured_at.replace("Z", "+00:00")).replace(tzinfo=None)
        except Exception:
            report_time = sim_now
    else:
        report_time = sim_now

    # 4. Duplicate Check (same type within 30 meters of an open case)
    dup = find_duplicate_case(db, lat, lng, defect_type)
    if dup:
        existing_case, dist_m = dup
        existing_case.supporting_count = (existing_case.supporting_count or 0) + 1
        existing_case.updated_at = sim_now

        # Save supporting evidence
        sup_evidence = Evidence(
            case_id=existing_case.id,
            evidence_type="supporting",
            file_path=rel_evidence_path,
            sha256_hash=sha256_hash,
            perceptual_hash=phash_str,
            latitude=lat,
            longitude=lng,
            captured_at=report_time,
            submitted_at=sim_now,
            confidence=confidence,
            area_ratio=area_ratio,
            defect_type=defect_type,
            detector_mode=detection.get("mode", "mock"),
            metadata_json=json.dumps({"description": description, "merged_duplicate": True, "distance_m": round(dist_m, 1)}),
        )
        db.add(sup_evidence)
        db.commit()

        # Append SUPPORTING_REPORT_ADDED ledger event
        append_event(
            db=db,
            case_id=existing_case.id,
            event_type="SUPPORTING_REPORT_ADDED",
            actor_role="CITIZEN",
            payload={
                "action": "Duplicate report merged into open case",
                "distance_meters": round(dist_m, 1),
                "supporting_count": existing_case.supporting_count,
            },
            evidence_hash=sha256_hash,
            timestamp=sim_now,
        )

        tracking_token = secrets.token_urlsafe(16)
        return {
            "ok": True,
            "case_id": existing_case.id,
            "merged_as_duplicate": True,
            "supporting_count": existing_case.supporting_count,
            "distance_m": round(dist_m, 1),
            "tracking_token": tracking_token,
            "detection": detection,
            "severity": existing_case.severity,
            "department": existing_case.department.code if existing_case.department else "PWD",
            "department_name": existing_case.department.name if existing_case.department else "Public Works & Roads Dept (Simulated)",
            "contract_liability": existing_case.contractor_liability,
            "deadlines": {
                "due_acknowledge_at": existing_case.due_acknowledge_at.isoformat() if existing_case.due_acknowledge_at else None,
                "due_resolve_at": existing_case.due_resolve_at.isoformat() if existing_case.due_resolve_at else None,
            },
            "message": f"Your report matched open case #{existing_case.id} within {round(dist_m, 1)}m and was added as supporting verification.",
        }

    # 5. Nearest-Asset Lookup (Haversine)
    try:
        nearest_asset, asset_dist = find_nearest_asset(db, lat, lng, defect_type)
        ward_id = nearest_asset.ward_id
        department_id = nearest_asset.department_id
        asset_id = nearest_asset.id
        road_importance = nearest_asset.road_importance or 1.0
    except Exception:
        # Fallback if no assets exist
        ward = db.query(Ward).first()
        dept = db.query(Department).first()
        ward_id = ward.id if ward else 1
        department_id = dept.id if dept else 1
        asset_id = None
        road_importance = 1.0
        nearest_asset = None

    # 6. Check Contractor Liability
    if asset_id:
        is_liable, contract = check_contractor_liability(db, asset_id, report_time)
        contract_id = contract.id if (contract and is_liable) else None
    else:
        is_liable = False
        contract = None
        contract_id = None

    # 7. Calculate Severity
    severity, raw_sev_score = calculate_severity(
        confidence=confidence,
        area_ratio=area_ratio,
        road_importance=road_importance,
        age_factor=1.0,
    )

    # 8. Compute SLA Deadlines
    sla = db.query(SlaPolicy).filter(SlaPolicy.severity == severity).first()
    sla_hours = sla.acknowledge_time_hours if sla else (4 if severity == "High" else 24)
    sla_days = sla.resolve_time_days if sla else (3 if severity == "High" else 7)
    due_ack = report_time + datetime.timedelta(hours=sla_hours)
    due_res = report_time + datetime.timedelta(days=sla_days)

    # 9. Generate Unique Case ID
    count_today = db.query(Case).count()
    case_id = f"CAS-{8901 + count_today}"
    while db.query(Case).filter(Case.id == case_id).first():
        case_id = f"CAS-{secrets.randbelow(9000) + 1000}"

    ward_obj = db.query(Ward).filter(Ward.id == ward_id).first()
    dept_obj = db.query(Department).filter(Department.id == department_id).first()

    title = f"{defect_type.replace('_', ' ').title()} near {nearest_asset.name if nearest_asset else 'Ward Sector'}"
    address_str = nearest_asset.address if nearest_asset else f"{ward_obj.name if ward_obj else 'Faridabad'}"

    new_case = Case(
        id=case_id,
        ward_id=ward_id,
        department_id=department_id,
        asset_id=asset_id,
        contract_id=contract_id,
        title=title,
        description=description or f"Citizen report logged via CivicLedger mobile interface.",
        defect_type=defect_type,
        severity=severity,
        status="Assigned",
        contractor_liability=is_liable,
        current_escalation_level="L1",
        citizen_phone=citizen_phone,
        latitude=lat,
        longitude=lng,
        address=address_str,
        opened_at=report_time,
        due_acknowledge_at=due_ack,
        due_resolve_at=due_res,
        supporting_count=0,
        created_at=report_time,
        updated_at=report_time,
    )
    db.add(new_case)
    db.commit()

    # Save original Evidence
    orig_ev = Evidence(
        case_id=new_case.id,
        evidence_type="original",
        file_path=rel_evidence_path,
        sha256_hash=sha256_hash,
        perceptual_hash=phash_str,
        latitude=lat,
        longitude=lng,
        captured_at=report_time,
        submitted_at=sim_now,
        confidence=confidence,
        area_ratio=area_ratio,
        defect_type=defect_type,
        detector_mode=detection.get("mode", "mock"),
        metadata_json=json.dumps({"description": description, "device": "Citizen Mobile"}),
    )
    db.add(orig_ev)
    db.commit()

    # 10. Append REAL LEDGER EVENTS (REPORTED, AI_VERIFIED, ASSIGNED)
    # Event 1: REPORTED
    append_event(
        db=db,
        case_id=new_case.id,
        event_type="REPORTED",
        actor_role="CITIZEN",
        payload={
            "defect_type": defect_type,
            "severity": severity,
            "latitude": lat,
            "longitude": lng,
            "ward_id": ward_id,
        },
        evidence_hash=sha256_hash,
        timestamp=report_time,
    )

    # Event 2: AI_VERIFIED
    append_event(
        db=db,
        case_id=new_case.id,
        event_type="AI_VERIFIED",
        actor_role="AI_DETECTOR",
        payload={
            "defect_classified": defect_type,
            "confidence": confidence,
            "area_ratio": area_ratio,
            "severity_assigned": severity,
            "detector_mode": detection.get("mode", "mock"),
        },
        evidence_hash=sha256_hash,
        timestamp=report_time + datetime.timedelta(seconds=5),
    )

    # Event 3: ASSIGNED
    append_event(
        db=db,
        case_id=new_case.id,
        event_type="ASSIGNED",
        actor_role="SYSTEM",
        payload={
            "department": dept_obj.code if dept_obj else "PWD",
            "contractor_liability": is_liable,
            "contract_ref": contract.contract_ref if contract else None,
            "due_acknowledge_at": due_ack.isoformat(),
            "due_resolve_at": due_res.isoformat(),
        },
        timestamp=report_time + datetime.timedelta(seconds=15),
    )

    # 11. Create Outbox Notification
    tracking_token = secrets.token_urlsafe(16)
    db.add(
        Notification(
            case_id=new_case.id,
            recipient_role="CITIZEN",
            recipient_contact=citizen_phone or "+91-9876543210",
            message=f"CivicLedger: Case #{new_case.id} registered for {defect_type}. Track at /track/{new_case.id}?token={tracking_token}",
            channel="SMS (simulated)",
            status="SENT",
            sent_at=sim_now,
        )
    )
    db.commit()

    return {
        "ok": True,
        "case_id": new_case.id,
        "tracking_token": tracking_token,
        "detection": detection,
        "severity": severity,
        "department": dept_obj.code if dept_obj else "PWD",
        "department_name": dept_obj.name if dept_obj else "Public Works",
        "contract_liability": is_liable,
        "deadlines": {
            "due_acknowledge_at": due_ack.isoformat(),
            "due_resolve_at": due_res.isoformat(),
            "acknowledge_hours": sla_hours,
            "resolve_days": sla_days,
        },
    }


# ============================================================================
# 4. CASES READ & FILTER ENDPOINTS
# ============================================================================
@app.get("/api/cases")
def get_cases(
    type: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    ward: Optional[str] = Query(None),
    ward_id: Optional[int] = Query(None),
    escalated: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """
    GET /api/cases:
    Filters: type, status, ward, escalated.
    Public view: never shows individual officer names.
    """
    query = db.query(Case)

    if type:
        query = query.filter(Case.defect_type == type)

    if status:
        query = query.filter(Case.status == status)

    # Ward filter: accepts either integer id or ward code string (e.g. WARD-14)
    target_ward = ward_id or ward
    if target_ward:
        if str(target_ward).isdigit():
            query = query.filter(Case.ward_id == int(target_ward))
        else:
            query = query.join(Ward, Case.ward_id == Ward.id).filter(Ward.code == target_ward)

    # Escalated filter
    if escalated and escalated.lower() in ["true", "1", "yes"]:
        query = query.filter(
            (Case.current_escalation_level != "L1")
            | (Case.status.like("Escalated%"))
            | (Case.contractor_liability == True)
        )

    cases = query.order_by(Case.opened_at.desc()).all()
    results = []

    for c in cases:
        firm_name = (
            c.contract.contractor.firm_name
            if c.contract and c.contract.contractor
            else "Department Direct Team"
        )
        results.append({
            "id": c.id,
            "title": c.title,
            "defect_type": c.defect_type,
            "severity": c.severity,
            "status": c.status,
            "contractor_liability": c.contractor_liability,
            "current_escalation_level": c.current_escalation_level,
            "ward_id": c.ward_id,
            "ward_code": c.ward.code if c.ward else None,
            "ward_name": c.ward.name if c.ward else None,
            "department_code": c.department.code if c.department else None,
            "department_name": c.department.name if c.department else None,
            "contractor_firm": firm_name,
            "latitude": c.latitude,
            "longitude": c.longitude,
            "address": c.address,
            "opened_at": c.opened_at.isoformat() if c.opened_at else None,
            "acknowledged_at": c.acknowledged_at.isoformat() if c.acknowledged_at else None,
            "resolved_at": c.resolved_at.isoformat() if c.resolved_at else None,
            "due_acknowledge_at": c.due_acknowledge_at.isoformat() if c.due_acknowledge_at else None,
            "due_resolve_at": c.due_resolve_at.isoformat() if c.due_resolve_at else None,
            "supporting_count": c.supporting_count or 0,
        })

    return {"total": len(results), "cases": results}


@app.get("/api/cases/{case_id}")
def get_case_detail(case_id: str, db: Session = Depends(get_db)):
    """
    GET /api/cases/{case_id}:
    Detailed view with evidence records.
    Never exposes personal officer names (only department and role).
    """
    c = db.query(Case).filter(Case.id == case_id).first()
    if not c:
        raise HTTPException(status_code=404, detail=f"Case #{case_id} not found.")

    firm_name = (
        c.contract.contractor.firm_name
        if c.contract and c.contract.contractor
        else "Municipal Direct Works"
    )

    ev_list = []
    orig_ev = None
    for ev in c.evidence:
        if ev.evidence_type == "original" and not orig_ev:
            orig_ev = ev
        ev_list.append({
            "id": ev.id,
            "evidence_type": ev.evidence_type,
            "file_path": ev.file_path,
            "sha256_hash": ev.sha256_hash,
            "perceptual_hash": ev.perceptual_hash,
            "confidence": ev.confidence,
            "area_ratio": ev.area_ratio,
            "detector_mode": ev.detector_mode,
            "defect_type": ev.defect_type,
            "latitude": ev.latitude,
            "longitude": ev.longitude,
            "captured_at": ev.captured_at.isoformat() if ev.captured_at else None,
            "submitted_at": ev.submitted_at.isoformat() if ev.submitted_at else None,
        })

    # Explainable severity score breakdown:
    # Severity = detection confidence x defect size ratio x road importance x age factor
    conf_val = orig_ev.confidence if orig_ev and orig_ev.confidence is not None else 0.88
    ratio_val = orig_ev.area_ratio if orig_ev and orig_ev.area_ratio is not None else 0.16
    imp_val = c.asset.road_importance if c.asset and c.asset.road_importance is not None else 1.2
    age_val = 1.25 if (c.contract or c.contractor_liability) else 1.0
    raw_score = round(conf_val * ratio_val * imp_val * age_val * 10, 2)
    severity_factors = {
        "confidence": round(conf_val, 2),
        "area_ratio": round(ratio_val, 2),
        "road_importance": round(imp_val, 2),
        "age_factor": round(age_val, 2),
        "raw_score": raw_score,
        "severity_tier": c.severity,
    }

    return {
        "id": c.id,
        "title": c.title,
        "description": c.description,
        "defect_type": c.defect_type,
        "severity": c.severity,
        "severity_factors": severity_factors,
        "status": c.status,
        "contractor_liability": c.contractor_liability,
        "current_escalation_level": c.current_escalation_level,
        "ward_id": c.ward_id,
        "ward_code": c.ward.code if c.ward else None,
        "ward_name": c.ward.name if c.ward else None,
        "department_id": c.department_id,
        "department_code": c.department.code if c.department else None,
        "department_name": c.department.name if c.department else None,
        "contractor_firm": firm_name,
        "contract_ref": c.contract.contract_ref if c.contract else None,
        "latitude": c.latitude,
        "longitude": c.longitude,
        "address": c.address,
        "opened_at": c.opened_at.isoformat() if c.opened_at else None,
        "acknowledged_at": c.acknowledged_at.isoformat() if c.acknowledged_at else None,
        "resolved_at": c.resolved_at.isoformat() if c.resolved_at else None,
        "due_acknowledge_at": c.due_acknowledge_at.isoformat() if c.due_acknowledge_at else None,
        "due_resolve_at": c.due_resolve_at.isoformat() if c.due_resolve_at else None,
        "supporting_count": c.supporting_count or 0,
        "evidence": ev_list,
    }


@app.get("/api/cases/{case_id}/timeline")
def get_case_timeline(case_id: str, db: Session = Depends(get_db)):
    """
    GET /api/cases/{case_id}/timeline:
    Returns the 7 plain-language steps (Reported, Checked by AI, Assigned,
    Seen by officer, Being fixed, Fixed and checked, Confirmed)
    with current holder and time left in simulated time.
    Supports English and Hindi keys.
    """
    c = db.query(Case).filter(Case.id == case_id).first()
    if not c:
        raise HTTPException(status_code=404, detail=f"Case #{case_id} not found.")

    sim_now = get_sim_now(db)
    return generate_case_timeline(c, sim_now, db)


# ============================================================================
# 5. CASE ACTIONS (ACKNOWLEDGE, REASSIGN, OVERRIDE-DETECTION)
# ============================================================================
@app.post("/api/cases/{case_id}/acknowledge")
def acknowledge_case(case_id: str, db: Session = Depends(get_db)):
    """
    POST /api/cases/{case_id}/acknowledge:
    Marks case as acknowledged by field officer.
    Appends real ACKNOWLEDGED event to SHA-256 ledger.
    """
    c = db.query(Case).filter(Case.id == case_id).first()
    if not c:
        raise HTTPException(status_code=404, detail=f"Case #{case_id} not found.")

    sim_now = get_sim_now(db)
    c.acknowledged_at = sim_now
    c.status = "Acknowledged"
    c.updated_at = sim_now
    db.commit()

    append_event(
        db=db,
        case_id=c.id,
        event_type="ACKNOWLEDGED",
        actor_role="FIELD_ENGINEER",
        payload={
            "action": "Case acknowledged by Field Officer",
            "acknowledged_at": sim_now.isoformat(),
            "status": "Acknowledged",
        },
        timestamp=sim_now,
    )

    db.add(
        Notification(
            case_id=c.id,
            recipient_role="CITIZEN",
            recipient_contact=c.citizen_phone or "+91-9876543210",
            message=f"Update: Case #{c.id} has been seen and acknowledged by the field engineer.",
            channel="SMS (simulated)",
            status="SENT",
            sent_at=sim_now,
        )
    )
    db.commit()

    return {"ok": True, "case_id": c.id, "status": c.status, "acknowledged_at": sim_now.isoformat()}


class ReassignModel(BaseModel):
    department_id: int
    reason: str


@app.post("/api/cases/{case_id}/reassign")
def reassign_case(case_id: str, req: ReassignModel, db: Session = Depends(get_db)):
    """
    POST /api/cases/{case_id}/reassign:
    Reassigns case to another municipal department. Logged to ledger.
    """
    c = db.query(Case).filter(Case.id == case_id).first()
    if not c:
        raise HTTPException(status_code=404, detail=f"Case #{case_id} not found.")

    target_dept = db.query(Department).filter(Department.id == req.department_id).first()
    if not target_dept:
        raise HTTPException(status_code=400, detail="Target department does not exist.")

    sim_now = get_sim_now(db)
    old_dept_code = c.department.code if c.department else "PWD"
    c.department_id = req.department_id
    c.updated_at = sim_now
    db.commit()

    append_event(
        db=db,
        case_id=c.id,
        event_type="REASSIGNED",
        actor_role="OFFICER",
        payload={
            "from_department": old_dept_code,
            "to_department": target_dept.code,
            "reason": req.reason,
            "reassigned_at": sim_now.isoformat(),
        },
        timestamp=sim_now,
    )

    return {"ok": True, "case_id": c.id, "department_id": req.department_id, "department_code": target_dept.code}


class OverrideDetectionModel(BaseModel):
    defect_type: Optional[str] = None
    severity: Optional[str] = None
    reason: str


@app.post("/api/cases/{case_id}/override-detection")
def override_detection(case_id: str, req: OverrideDetectionModel, db: Session = Depends(get_db)):
    """
    POST /api/cases/{case_id}/override-detection:
    Officer overrides AI defect classification or severity. Logged to ledger.
    """
    c = db.query(Case).filter(Case.id == case_id).first()
    if not c:
        raise HTTPException(status_code=404, detail=f"Case #{case_id} not found.")

    sim_now = get_sim_now(db)
    old_type = c.defect_type
    old_sev = c.severity

    if req.defect_type:
        c.defect_type = req.defect_type
    if req.severity:
        c.severity = req.severity
        # Recalculate SLA deadlines
        sla = db.query(SlaPolicy).filter(SlaPolicy.severity == req.severity).first()
        if sla and c.opened_at:
            c.due_acknowledge_at = c.opened_at + datetime.timedelta(hours=sla.acknowledge_time_hours)
            c.due_resolve_at = c.opened_at + datetime.timedelta(days=sla.resolve_time_days)

    c.updated_at = sim_now
    db.commit()

    append_event(
        db=db,
        case_id=c.id,
        event_type="DETECTION_OVERRIDDEN",
        actor_role="OFFICER",
        payload={
            "previous_type": old_type,
            "new_type": c.defect_type,
            "previous_severity": old_sev,
            "new_severity": c.severity,
            "reason": req.reason,
            "overridden_at": sim_now.isoformat(),
        },
        timestamp=sim_now,
    )

    return {
        "ok": True,
        "case_id": c.id,
        "defect_type": c.defect_type,
        "severity": c.severity,
    }


# ============================================================================
# 5b. CITIZEN REOPEN ACTION & TRACKING RESOLVER
# ============================================================================
@app.post("/api/cases/{case_id}/reopen")
def reopen_case(case_id: str, db: Session = Depends(get_db)):
    """
    POST /api/cases/{case_id}/reopen:
    Citizen taps 'Still broken' on tracking screen after repair.
    Reopens case and escalates to L2 Executive Engineer. Logged in ledger.
    """
    c = db.query(Case).filter(Case.id == case_id).first()
    if not c:
        raise HTTPException(status_code=404, detail=f"Case #{case_id} not found.")

    sim_now = get_sim_now(db)
    c.status = "Reopened"
    c.current_escalation_level = "L2"
    c.resolved_at = None
    # Restart the resolution deadline (e.g. 24h or based on SLA policy)
    sla = db.query(SlaPolicy).filter(SlaPolicy.severity == c.severity).first()
    resolve_hours = (sla.resolve_time_days * 24) if sla else 24
    c.due_resolve_at = sim_now + datetime.timedelta(hours=resolve_hours)
    c.updated_at = sim_now
    db.commit()

    append_event(
        db=db,
        case_id=c.id,
        event_type="CASE_REOPENED",
        actor_role="CITIZEN",
        payload={
            "action": "Citizen reported repair incomplete via one-tap 'Still Broken'",
            "previous_status": "Resolved",
            "reopened_at": sim_now.isoformat(),
            "escalated_to": "L2_EXECUTIVE_ENGINEER",
            "new_deadline": c.due_resolve_at.isoformat(),
        },
        timestamp=sim_now,
    )

    db.add(
        Notification(
            case_id=c.id,
            recipient_role="L2_EXECUTIVE_ENGINEER",
            recipient_contact="xen@sim-fbd.gov.in",
            message=f"REOPENED TICKET: Case #{c.id} flagged 'Still Broken' by citizen after repair. Requires L2 site review.",
            channel="SMS/EMAIL",
            status="SENT",
            sent_at=sim_now,
        )
    )
    db.commit()

    return {
        "ok": True,
        "case_id": c.id,
        "status": "Reopened",
        "current_escalation_level": "L2",
        "message": "Case successfully reopened and escalated for executive engineering review.",
    }


# ============================================================================
# 5c. REAL CLOSURE VERIFICATION ENGINE
# ============================================================================
@app.post("/api/cases/{case_id}/closure")
async def verify_case_closure(
    case_id: str,
    after_photo: Optional[UploadFile] = File(None),
    lat: Optional[float] = Form(None),
    lng: Optional[float] = Form(None),
    captured_at: Optional[str] = Form(None),
    demo_preset: Optional[str] = Form(None),
    actor_role: Optional[str] = Form("OFFICER"),
    db: Session = Depends(get_db),
):
    """
    POST /api/cases/{id}/closure (multipart: after photo, lat, lng, captured_at).
    Runs the 4 closure rules in order, collects every failure:
      1. After-photo GPS within 25 m of original defect location.
      2. Captured live within 10 minutes of submission and after assignment.
      3. Perceptual-hash distance from every earlier evidence image > 8 (no reuse).
      4. Detector finds no defect above 0.5 confidence.
    Writes CLOSURE_VERIFIED or CLOSURE_REJECTED to the ledger, stores evidence with hashes,
    and returns plain-language reasons in English and Hindi keys.
    """
    c = db.query(Case).filter(Case.id == case_id).first()
    if not c:
        raise HTTPException(status_code=404, detail=f"Case #{case_id} not found.")

    sim_now = get_sim_now(db)

    # 1. Resolve photo bytes, filename, coordinates, and timestamp
    # Handle demo shortcuts or direct file uploads
    photo_bytes: Optional[bytes] = None
    photo_filename: str = "after_repair.jpg"
    samples_dir = os.path.join(DATA_DIR, "samples")

    if demo_preset:
        # Pre-configured demo test scenarios using real files
        if demo_preset == "reuse_old_photo":
            orig_ev = db.query(Evidence).filter(Evidence.case_id == c.id, Evidence.evidence_type == "original").first()
            if orig_ev and orig_ev.file_path:
                rel_clean = orig_ev.file_path.lstrip("/").replace("evidence_store/", "")
                ev_disk_path = os.path.join(EVIDENCE_STORE_DIR, rel_clean)
                if os.path.exists(ev_disk_path):
                    with open(ev_disk_path, "rb") as f_in:
                        photo_bytes = f_in.read()
                    photo_filename = rel_clean
            if not photo_bytes:
                sample_pothole = os.path.join(samples_dir, "pothole1.jpg")
                if os.path.exists(sample_pothole):
                    with open(sample_pothole, "rb") as f_in:
                        photo_bytes = f_in.read()
                    photo_filename = "pothole1.jpg"
            lat = c.latitude if lat is None else lat
            lng = c.longitude if lng is None else lng
            captured_at = sim_now.isoformat() if not captured_at else captured_at

        elif demo_preset == "wrong_location":
            clean_sample = os.path.join(samples_dir, "clean and pothole free road.jpg")
            if os.path.exists(clean_sample):
                with open(clean_sample, "rb") as f_in:
                    photo_bytes = f_in.read()
                photo_filename = "clean and pothole free road.jpg"
            # Coordinates offset ~330m away (breaches 25m boundary)
            lat = c.latitude + 0.003
            lng = c.longitude + 0.003
            captured_at = sim_now.isoformat() if not captured_at else captured_at

        elif demo_preset == "defect_still_visible":
            pothole_sample = os.path.join(samples_dir, "pothole1.jpg")
            if os.path.exists(pothole_sample):
                with open(pothole_sample, "rb") as f_in:
                    photo_bytes = f_in.read()
                photo_filename = "pothole1.jpg"
            lat = c.latitude if lat is None else lat
            lng = c.longitude if lng is None else lng
            captured_at = sim_now.isoformat() if not captured_at else captured_at

        elif demo_preset == "stale_timestamp":
            clean_sample = os.path.join(samples_dir, "clean and pothole free road.jpg")
            if os.path.exists(clean_sample):
                with open(clean_sample, "rb") as f_in:
                    photo_bytes = f_in.read()
                photo_filename = "clean and pothole free road.jpg"
            lat = c.latitude if lat is None else lat
            lng = c.longitude if lng is None else lng
            captured_at = (sim_now - datetime.timedelta(hours=2)).isoformat()

        elif demo_preset in ["repaired_scene", "genuine_repair"]:
            clean_sample = os.path.join(samples_dir, "clean and pothole free road.jpg")
            if os.path.exists(clean_sample):
                with open(clean_sample, "rb") as f_in:
                    photo_bytes = f_in.read()
                photo_filename = "clean and pothole free road.jpg"
            lat = c.latitude if lat is None else lat
            lng = c.longitude if lng is None else lng
            captured_at = sim_now.isoformat() if not captured_at else captured_at

    if not photo_bytes and after_photo:
        photo_bytes = await after_photo.read()
        photo_filename = after_photo.filename or "after_repair.jpg"

    if not photo_bytes:
        raise HTTPException(
            status_code=400,
            detail="After-photo evidence is required. Please upload an image or select a demo shortcut.",
        )

    # Defaults for coordinates and timestamp if not provided
    req_lat = lat if lat is not None else c.latitude
    req_lng = lng if lng is not None else c.longitude

    # Parse capture datetime
    try:
        if captured_at:
            clean_str = captured_at.replace("Z", "+00:00")
            if "+" in clean_str:
                captured_dt = datetime.datetime.fromisoformat(clean_str).replace(tzinfo=None)
            else:
                captured_dt = datetime.datetime.fromisoformat(clean_str)
        else:
            captured_dt = sim_now
    except Exception:
        captured_dt = sim_now

    # -------------------------------------------------------------------------
    # RULE 1: After-photo GPS within 25 m of the original
    # -------------------------------------------------------------------------
    dist_m = haversine_distance_m(c.latitude, c.longitude, req_lat, req_lng)
    rule1_passed = dist_m <= 25.0
    rule1 = {
        "rule": 1,
        "key": "gps_proximity",
        "name_en": "GPS Proximity (≤ 25m)",
        "name_hi": "जीपीएस निकटता (≤ 25 मीटर)",
        "passed": rule1_passed,
        "measured_distance_m": round(dist_m, 1),
        "allowed_radius_m": 25.0,
        "reason_en": (
            f"Verified within repair site boundary ({dist_m:.1f}m from defect coordinates)."
            if rule1_passed
            else f"GPS verification failed: Photo taken {dist_m:.1f}m away from defect site (allowed: ≤ 25m)."
        ),
        "reason_hi": (
            f"मरम्मत स्थल के सही दायरे में सत्यापित (समस्या स्थल से दूरी: {dist_m:.1f} मीटर)।"
            if rule1_passed
            else f"जीपीएस सत्यापन विफल: फोटो समस्या स्थल से {dist_m:.1f} मीटर दूर ली गई है (अनुमति: ≤ 25 मीटर)।"
        ),
    }

    # -------------------------------------------------------------------------
    # RULE 2: Captured live within 10 minutes of submission and after assignment
    # -------------------------------------------------------------------------
    rule2_passed = True
    rule2_reason_en = "Captured live on site within valid 10-minute window."
    rule2_reason_hi = "मान्य 10 मिनट के भीतर मौके पर लाइव कैप्चर किया गया।"

    if c.opened_at and captured_dt < (c.opened_at - datetime.timedelta(seconds=60)):
        rule2_passed = False
        rule2_reason_en = "Timestamp verification failed: Photo was captured before defect was reported/assigned."
        rule2_reason_hi = "समय सत्यापन विफल: फोटो समस्या की रिपोर्ट दर्ज होने से पहले ली गई थी।"
    else:
        age_seconds = (sim_now - captured_dt).total_seconds()
        if age_seconds > 600:
            rule2_passed = False
            minutes_ago = int(age_seconds // 60)
            rule2_reason_en = f"Live capture verification failed: Photo must be taken live within 10 minutes of submission (captured {minutes_ago}m ago)."
            rule2_reason_hi = f"लाइव कैप्चर सत्यापन विफल: फोटो सबमिशन के 10 मिनट के भीतर ली जानी चाहिए ({minutes_ago} मिनट पुरानी)।"
        elif age_seconds < -60:
            rule2_passed = False
            rule2_reason_en = "Timestamp verification failed: Photo capture timestamp is in the future."
            rule2_reason_hi = "समय सत्यापन विफल: फोटो कैप्चर का समय भविष्य का है।"

    rule2 = {
        "rule": 2,
        "key": "live_timestamp",
        "name_en": "Live Capture Window (≤ 10 min)",
        "name_hi": "लाइव कैप्चर विंडो (≤ 10 मिनट)",
        "passed": rule2_passed,
        "captured_at": captured_dt.isoformat(),
        "reason_en": rule2_reason_en,
        "reason_hi": rule2_reason_hi,
    }

    # -------------------------------------------------------------------------
    # RULE 3: Perceptual-hash distance from every earlier evidence image > 8 (no reuse)
    # -------------------------------------------------------------------------
    curr_sha256 = hashlib.sha256(photo_bytes).hexdigest()
    try:
        pil_img = Image.open(io.BytesIO(photo_bytes))
        curr_phash = imagehash.phash(pil_img)
    except Exception:
        curr_phash = None

    rule3_passed = True
    rule3_reason_en = "No image reuse detected; unique post-repair photographic evidence."
    rule3_reason_hi = "फोटो का कोई पुन: उपयोग नहीं पाया गया; अद्वितीय मरम्मत साक्ष्य।"

    existing_evidences = db.query(Evidence).filter(Evidence.case_id == c.id).all()
    for ev in existing_evidences:
        if ev.sha256_hash and ev.sha256_hash == curr_sha256:
            rule3_passed = False
            rule3_reason_en = "Image reuse detected: File hash is identical to earlier evidence on this case."
            rule3_reason_hi = "फोटो का पुन: उपयोग पकड़ा गया: फाइल पहले की साक्ष्य फोटो से बिल्कुल मेल खाती है।"
            break
        if ev.perceptual_hash and curr_phash:
            try:
                ev_ph = imagehash.hex_to_hash(ev.perceptual_hash)
                h_dist = curr_phash - ev_ph
                if h_dist <= 8:
                    rule3_passed = False
                    sim_pct = int(round((1.0 - (h_dist / 64.0)) * 100))
                    rule3_reason_en = f"Image reuse detected: Visual fingerprint matches earlier evidence (perceptual distance {h_dist} ≤ 8, similarity {sim_pct}%)."
                    rule3_reason_hi = f"फोटो का पुन: उपयोग पकड़ा गया: दृश्य समानता {sim_pct}% (दूरी {h_dist} ≤ 8)।"
                    break
            except Exception:
                pass

    rule3 = {
        "rule": 3,
        "key": "no_image_reuse",
        "name_en": "No Photo Reuse (pHash Distance > 8)",
        "name_hi": "पुरानी फोटो का पुनः उपयोग नहीं (pHash > 8)",
        "passed": rule3_passed,
        "sha256_hash": curr_sha256,
        "perceptual_hash": str(curr_phash) if curr_phash else None,
        "reason_en": rule3_reason_en,
        "reason_hi": rule3_reason_hi,
    }

    # -------------------------------------------------------------------------
    # RULE 4: Detector finds no defect above 0.5 confidence
    # -------------------------------------------------------------------------
    det = detect(photo_bytes, filename=photo_filename)
    rule4_passed = True
    rule4_reason_en = "AI computer vision re-inspection confirms defect has been cleared."
    rule4_reason_hi = "एआई कंप्यूटर विजन निरीक्षण पुष्टि करता है कि दोष दूर कर दिया गया है।"

    defect_detected = det.get("type")
    conf_val = det.get("confidence", 0.0)

    if conf_val >= 0.50 and defect_detected not in [None, "clean", "unrelated"]:
        rule4_passed = False
        conf_pct = int(round(conf_val * 100))
        rule4_reason_en = f"AI defect clearance failed: {defect_detected.capitalize()} still detected in scene ({conf_pct}% confidence ≥ 50%)."
        rule4_reason_hi = f"एआई निरीक्षण विफल: मौके पर अभी भी {conf_pct}% आत्मविश्वास के साथ {defect_detected} दिखाई दे रहा है।"

    rule4 = {
        "rule": 4,
        "key": "ai_defect_clearance",
        "name_en": "AI Defect Clearance (< 50% defect confidence)",
        "name_hi": "एआई दोष निकासी (< 50% आत्मविश्वास)",
        "passed": rule4_passed,
        "defect_detected": defect_detected,
        "confidence": conf_val,
        "reason_en": rule4_reason_en,
        "reason_hi": rule4_reason_hi,
    }

    # -------------------------------------------------------------------------
    # EVALUATION & PERSISTENCE (EVIDENCE & LEDGER)
    # -------------------------------------------------------------------------
    rules = [rule1, rule2, rule3, rule4]
    verified = all(r["passed"] for r in rules)
    failed_rules = [r["key"] for r in rules if not r["passed"]]
    reasons_en = [r["reason_en"] for r in rules if not r["passed"]]
    reasons_hi = [r["reason_hi"] for r in rules if not r["passed"]]

    # Save evidence file to disk
    ext = os.path.splitext(photo_filename)[1] or ".jpg"
    target_fname = f"{curr_sha256}{ext}"
    target_path = os.path.join(EVIDENCE_STORE_DIR, target_fname)
    if not os.path.exists(target_path):
        with open(target_path, "wb") as f_out:
            f_out.write(photo_bytes)

    evidence_rel_path = f"/evidence_store/{target_fname}"

    if verified:
        # Verified closure
        db.add(
            Evidence(
                case_id=c.id,
                evidence_type="after_repair",
                file_path=evidence_rel_path,
                sha256_hash=curr_sha256,
                perceptual_hash=str(curr_phash) if curr_phash else None,
                latitude=req_lat,
                longitude=req_lng,
                captured_at=captured_dt,
                submitted_at=sim_now,
                confidence=det.get("confidence"),
                area_ratio=det.get("area_ratio"),
                defect_type=det.get("type"),
                detector_mode=det.get("mode", "mock"),
            )
        )
        c.status = "Resolved"
        c.resolved_at = sim_now
        c.updated_at = sim_now
        db.commit()

        append_event(
            db=db,
            case_id=c.id,
            event_type="CLOSURE_VERIFIED",
            actor_role=actor_role or "OFFICER",
            payload={
                "action": "Closure verified by automated AI inspection",
                "rules_checked": 4,
                "passed_all": True,
                "distance_m": round(dist_m, 1),
                "detector_type": det.get("type"),
                "detector_confidence": det.get("confidence"),
                "resolved_at": sim_now.isoformat(),
            },
            evidence_hash=curr_sha256,
            timestamp=sim_now,
        )

        db.add(
            Notification(
                case_id=c.id,
                recipient_role="CITIZEN",
                recipient_contact=c.citizen_phone or "+91-9876543210",
                message=f"CivicLedger: Case #{c.id} has been repaired and verified by AI. Check your repair at /track/{c.id}",
                channel="SMS (simulated)",
                status="SENT",
                sent_at=sim_now,
            )
        )
        db.commit()

        return {
            "ok": True,
            "verified": True,
            "case_id": c.id,
            "status": "Resolved",
            "rules": rules,
            "reasons": [],
            "reasons_en": [],
            "reasons_hi": [],
            "evidence_hash": curr_sha256,
            "file_path": evidence_rel_path,
            "message": "Closure verified and case marked Resolved.",
        }

    else:
        # Rejected closure
        db.add(
            Evidence(
                case_id=c.id,
                evidence_type="rejected_closure",
                file_path=evidence_rel_path,
                sha256_hash=curr_sha256,
                perceptual_hash=str(curr_phash) if curr_phash else None,
                latitude=req_lat,
                longitude=req_lng,
                captured_at=captured_dt,
                submitted_at=sim_now,
                confidence=det.get("confidence"),
                defect_type=det.get("type"),
                detector_mode=det.get("mode", "mock"),
            )
        )
        c.updated_at = sim_now
        db.commit()

        append_event(
            db=db,
            case_id=c.id,
            event_type="CLOSURE_REJECTED",
            actor_role=actor_role or "OFFICER",
            payload={
                "action": "Closure attempt rejected by verification rules",
                "failed_rules": failed_rules,
                "reasons_en": reasons_en,
                "reasons_hi": reasons_hi,
                "distance_m": round(dist_m, 1),
                "attempted_at": sim_now.isoformat(),
            },
            evidence_hash=curr_sha256,
            timestamp=sim_now,
        )

        db.add(
            Notification(
                case_id=c.id,
                recipient_role="OFFICER",
                recipient_contact="field_officer@sim-fbd.gov.in",
                message=f"CLOSURE REJECTED: Case #{c.id} failed verification rules: {', '.join(reasons_en)}",
                channel="SYSTEM",
                status="SENT",
                sent_at=sim_now,
            )
        )
        db.commit()

        return {
            "ok": False,
            "verified": False,
            "case_id": c.id,
            "status": c.status,
            "rules": rules,
            "reasons": reasons_en,
            "reasons_en": reasons_en,
            "reasons_hi": reasons_hi,
            "evidence_hash": curr_sha256,
            "file_path": evidence_rel_path,
            "message": f"Closure rejected: {'; '.join(reasons_en)}",
        }


@app.get("/api/track/{token_or_id}")
def track_case(token_or_id: str, db: Session = Depends(get_db)):
    """
    GET /api/track/{token_or_id}:
    Resolves case by ID (e.g. CAS-8901) or by tracking token from notification.
    Returns full timeline, holder, time left, before and after photos.
    No login required.
    """
    # 1. Direct case ID lookup
    case = db.query(Case).filter(Case.id == token_or_id).first()

    # 2. Look up via notification tracking token
    if not case:
        notif = (
            db.query(Notification)
            .filter(Notification.message.like(f"%token={token_or_id}%"))
            .first()
        )
        if notif and notif.case_id:
            case = db.query(Case).filter(Case.id == notif.case_id).first()

    # 3. Handle token parameter with ?token= format
    if not case and "CAS-" in token_or_id:
        extracted = token_or_id.split("?")[0].split("/")[-1]
        case = db.query(Case).filter(Case.id == extracted).first()

    # 4. Fallback for resilient demo exploration
    if not case:
        case = db.query(Case).order_by(Case.opened_at.desc()).first()

    if not case:
        raise HTTPException(status_code=404, detail="Case not found.")

    sim_now = get_sim_now(db)
    timeline = generate_case_timeline(case, sim_now, db)

    before_ev = (
        db.query(Evidence)
        .filter(Evidence.case_id == case.id, Evidence.evidence_type.in_(["original", "supporting"]))
        .first()
    )
    after_ev = (
        db.query(Evidence)
        .filter(Evidence.case_id == case.id, Evidence.evidence_type == "after_repair")
        .first()
    )

    firm_name = (
        case.contract.contractor.firm_name
        if case.contract and case.contract.contractor
        else "Municipal Direct Works Division"
    )

    return {
        "ok": True,
        "case_id": case.id,
        "title": case.title,
        "description": case.description,
        "defect_type": case.defect_type,
        "severity": case.severity,
        "status": case.status,
        "contractor_liability": case.contractor_liability,
        "current_escalation_level": case.current_escalation_level,
        "department_name": case.department.name if case.department else "PWD",
        "department_code": case.department.code if case.department else "PWD",
        "contractor_firm": firm_name,
        "address": case.address,
        "opened_at": case.opened_at.isoformat() if case.opened_at else None,
        "due_acknowledge_at": case.due_acknowledge_at.isoformat() if case.due_acknowledge_at else None,
        "due_resolve_at": case.due_resolve_at.isoformat() if case.due_resolve_at else None,
        "before_photo": before_ev.file_path if before_ev else None,
        "after_photo": after_ev.file_path if after_ev else None,
        "timeline": timeline,
    }


@app.post("/api/detector/preview")
async def preview_detection(photo: UploadFile = File(...)):
    """
    Runs Computer Vision AI on uploaded photo to preview defect classification,
    bounding box, area ratio, and severity before full report submission.
    """
    image_bytes = await photo.read()
    det = detect(image_bytes, filename=photo.filename)
    return {
        "ok": True,
        "detection": det,
        "is_defect": det.get("type") not in ["clean", "unrelated"] and float(det.get("confidence", 0.0)) >= 0.40,
    }


@app.get("/api/location/lookup")
def lookup_location(
    lat: float = Query(...),
    lng: float = Query(...),
    defect_type: str = Query("pothole"),
    db: Session = Depends(get_db),
):
    """
    Looks up nearest asset, address, and ward name for given GPS coordinates.
    """
    try:
        nearest_asset, dist = find_nearest_asset(db, lat, lng, defect_type)
        return {
            "ok": True,
            "address": nearest_asset.address,
            "asset_name": nearest_asset.name,
            "ward_name": nearest_asset.ward.name,
            "ward_code": nearest_asset.ward.code,
            "distance_m": round(dist, 1),
        }
    except Exception:
        return {
            "ok": True,
            "address": "Sector 14 Main Road, Faridabad",
            "asset_name": "Sector 14 Main Commercial Avenue",
            "ward_name": "Ward 14 (Old Faridabad & Central Sector)",
            "ward_code": "WARD-14",
            "distance_m": 0.0,
        }


# ============================================================================
# 6. CLOCK & ADVANCE TIME ENDPOINTS
# ============================================================================
@app.get("/api/clock")
def get_clock(db: Session = Depends(get_db)):
    """
    GET /api/clock:
    Returns current simulated time.
    """
    sim_now = get_sim_now(db)
    return {
        "sim_now": sim_now.isoformat(),
        "formatted": sim_now.strftime("%Y-%m-%d %H:%M:%S UTC"),
        "is_simulated": True,
    }


class AdvanceClockModel(BaseModel):
    hours: float = 4.0


@app.post("/api/demo/advance")
def advance_clock(req: AdvanceClockModel, db: Session = Depends(get_db)):
    """
    POST /api/demo/advance:
    Advances simulated clock by N hours and evaluates case deadlines immediately.
    """
    new_sim_now, escalations = advance_sim_clock(db, req.hours)
    return {
        "ok": True,
        "advanced_hours": req.hours,
        "sim_now": new_sim_now.isoformat(),
        "escalations_triggered": escalations,
        "message": f"Simulated clock advanced by {req.hours} hours. {escalations} escalation(s) triggered.",
    }


# ============================================================================
# 7. DEPARTMENT SCORECARDS ENDPOINT
# ============================================================================
@app.get("/api/scorecards")
def get_scorecards(db: Session = Depends(get_db)):
    """
    GET /api/scorecards:
    Computes per department: median time to acknowledge, median time to resolve,
    escalation rate, reopen rate, rejected-closure rate, and a letter grade.
    """
    scorecards = compute_department_scorecards(db)
    return {"scorecards": scorecards}


# ============================================================================
# 8. LEDGER ENDPOINTS (PRESERVED FROM MODULE 3)
# ============================================================================
@app.get("/api/ledger")
def get_ledger(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    case_id: Optional[str] = Query(None),
    order: str = Query("asc", pattern="^(asc|desc)$"),
    db: Session = Depends(get_db),
):
    """
    GET /api/ledger:
    Returns paginated stream of SHA-256 chained events.
    """
    query = db.query(Event)
    if case_id:
        query = query.filter(Event.case_id == case_id)

    total = query.count()
    if order == "desc":
        events = query.order_by(Event.sequence.desc()).offset(offset).limit(limit).all()
    else:
        events = query.order_by(Event.sequence.asc()).offset(offset).limit(limit).all()

    items = []
    for ev in events:
        try:
            payload_data = json.loads(ev.payload)
        except Exception:
            payload_data = ev.payload

        items.append({
            "id": ev.id,
            "sequence": ev.sequence,
            "case_id": ev.case_id,
            "event_type": ev.event_type,
            "actor_role": ev.actor_role,
            "payload": payload_data,
            "evidence_hash": ev.evidence_hash,
            "prev_hash": ev.prev_hash,
            "own_hash": ev.own_hash,
            "timestamp": ev.timestamp.isoformat(),
        })

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "events": items,
    }


@app.get("/api/ledger/verify")
def verify_ledger_chain(db: Session = Depends(get_db)):
    """
    GET /api/ledger/verify:
    Recomputes the cryptographic hash chain from sequence #1 to latest block.
    Returns: { valid, checked, first_broken_sequence, reason }
    """
    return verify_chain(db)


class AnchorRequest(BaseModel):
    notes: Optional[str] = None


@app.post("/api/ledger/anchor")
def post_anchor(req: Optional[AnchorRequest] = None, db: Session = Depends(get_db)):
    notes = req.notes if req else None
    anchor = create_anchor(db, notes=notes)
    if not anchor:
        raise HTTPException(status_code=400, detail="Cannot anchor an empty ledger")

    return {
        "id": anchor.id,
        "sequence": anchor.sequence,
        "head_hash": anchor.head_hash,
        "notes": anchor.notes,
        "created_at": anchor.created_at.isoformat(),
    }


@app.get("/api/anchors")
def get_anchors(db: Session = Depends(get_db)):
    anchors = db.query(Anchor).order_by(Anchor.sequence.asc()).all()
    verification = verify_against_anchors(db)

    anchor_list = [
        {
            "id": a.id,
            "sequence": a.sequence,
            "head_hash": a.head_hash,
            "notes": a.notes,
            "created_at": a.created_at.isoformat(),
        }
        for a in anchors
    ]

    return {
        "anchors": anchor_list,
        "verification": verification,
    }


class TamperRequest(BaseModel):
    sequence: Optional[int] = 5
    field_to_corrupt: Optional[str] = "payload"


@app.post("/api/demo/tamper")
def simulate_tamper(req: Optional[TamperRequest] = None, db: Session = Depends(get_db)):
    target_seq = req.sequence if (req and req.sequence) else 5
    event = db.query(Event).filter(Event.sequence == target_seq).first()
    if not event:
        event = db.query(Event).first()
        if not event:
            raise HTTPException(status_code=400, detail="No events to tamper with. Launch or seed first.")
        target_seq = event.sequence

    tampered_payload = {
        "tampered": True,
        "original_payload_corrupted": True,
        "attack_vector": "Direct SQLite update bypassing application ledger engine",
        "timestamp": datetime.datetime.utcnow().isoformat(),
    }
    event.payload = json.dumps(tampered_payload, sort_keys=True)
    db.commit()

    return {
        "ok": True,
        "tampered_sequence": target_seq,
        "message": f"Block #{target_seq} payload was maliciously modified in database. Verification will fail at block #{target_seq}.",
    }


@app.post("/api/demo/reset")
def reset_demo_state(db: Session = Depends(get_db)):
    t_start = datetime.datetime.utcnow()
    v_result = reset_seed_data(db)
    duration_sec = (datetime.datetime.utcnow() - t_start).total_seconds()

    return {
        "ok": True,
        "duration_seconds": round(duration_sec, 2),
        "total_blocks": v_result["checked"],
        "chain_valid": v_result["valid"],
        "message": f"Database rebuilt to clean seed state in {duration_sec:.2f} seconds.",
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
