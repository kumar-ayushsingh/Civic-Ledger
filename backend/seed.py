import datetime
import hashlib
import io
import os
import shutil
from typing import Dict, List, Tuple
from PIL import Image
import imagehash
from sqlalchemy.orm import Session

from database import Base, EVIDENCE_STORE_DIR, DATA_DIR, engine
from detector import detect
from ledger import append_event, create_anchor, verify_chain
from models import (
    Anchor,
    Asset,
    Case,
    Contract,
    Contractor,
    Department,
    Event,
    Evidence,
    Notification,
    Officer,
    OtpSession,
    Setting,
    SlaPolicy,
    Ward,
)

SAMPLES_DIR = os.path.join(DATA_DIR, "samples")


def process_sample_images() -> Dict[str, Tuple[str, str, str]]:
    """
    Reads sample images from backend/data/samples,
    hashes them (SHA-256 and pHash), stores in evidence_store named by SHA-256.
    Returns map: keyword -> (rel_path, sha256, phash)
    """
    os.makedirs(EVIDENCE_STORE_DIR, exist_ok=True)
    image_map = {}

    if not os.path.exists(SAMPLES_DIR):
        return image_map

    for fname in os.listdir(SAMPLES_DIR):
        fpath = os.path.join(SAMPLES_DIR, fname)
        if not os.path.isfile(fpath) or fname.lower().endswith(".txt"):
            continue

        with open(fpath, "rb") as f:
            content = f.read()

        sha256_hash = hashlib.sha256(content).hexdigest()
        ext = os.path.splitext(fname)[1] or ".jpg"
        target_name = f"{sha256_hash}{ext}"
        target_path = os.path.join(EVIDENCE_STORE_DIR, target_name)

        if not os.path.exists(target_path):
            with open(target_path, "wb") as f_out:
                f_out.write(content)

        # Compute perceptual hash
        try:
            img = Image.open(io.BytesIO(content))
            phash_str = str(imagehash.phash(img))
        except Exception:
            phash_str = sha256_hash[:16]

        rel_path = f"evidence_store/{target_name}"

        # Assign friendly lookup keys based on sample filename
        fn_low = fname.lower()
        if "clean" in fn_low:
            image_map["clean"] = (rel_path, sha256_hash, phash_str)
        elif "pothole1" in fn_low:
            image_map["pothole1"] = (rel_path, sha256_hash, phash_str)
        elif "pothole2" in fn_low:
            image_map["pothole2"] = (rel_path, sha256_hash, phash_str)
        elif "garbage" in fn_low:
            image_map["garbage"] = (rel_path, sha256_hash, phash_str)
        elif "waterlog" in fn_low:
            image_map["waterlogging"] = (rel_path, sha256_hash, phash_str)
        elif "unrelated" in fn_low:
            image_map["unrelated"] = (rel_path, sha256_hash, phash_str)

    return image_map


def seed_database(db: Session):
    """
    Seeds simulated Faridabad-style ward data using fictional names and labels.
    Generates all ledger events by calling real engine functions.
    """
    print("[Seed] Starting database seeding...")
    sim_now = datetime.datetime(2026, 10, 29, 12, 0, 0)

    # 0. Set simulated clock
    clock_setting = db.query(Setting).filter(Setting.key == "simulated_clock").first()
    if not clock_setting:
        db.add(Setting(key="simulated_clock", value=sim_now.isoformat()))
    else:
        clock_setting.value = sim_now.isoformat()
    db.commit()

    # Process evidence sample images
    evidence_images = process_sample_images()

    # 1. SLA Policies
    sla_policies = [
        SlaPolicy(severity="High", acknowledge_time_hours=4, resolve_time_days=3, description="Critical arterial roads / heavy hazard"),
        SlaPolicy(severity="Medium", acknowledge_time_hours=24, resolve_time_days=7, description="Secondary collector roads / moderate defect"),
        SlaPolicy(severity="Low", acknowledge_time_hours=48, resolve_time_days=14, description="Local residential lanes / minor defect"),
    ]
    db.add_all(sla_policies)
    db.commit()

    # 2. Departments
    departments = [
        Department(
            code="PWD_ROADS",
            name="Public Works & Roads Dept (Simulated)",
            description="Municipal road maintenance, asphalt surfacing, pothole repairs and curbs.",
            contact_email="roads.pwd@sim-faridabad.gov.in",
        ),
        Department(
            code="SANITATION",
            name="Sanitation & Solid Waste Management (Simulated)",
            description="Garbage removal, community dumpster clearance and street cleanliness.",
            contact_email="sanitation@sim-faridabad.gov.in",
        ),
        Department(
            code="DRAINAGE",
            name="Stormwater & Drainage Dept (Simulated)",
            description="Stormwater drains, culverts, de-silting and flood alleviation.",
            contact_email="drainage@sim-faridabad.gov.in",
        ),
    ]
    db.add_all(departments)
    db.commit()

    dept_roads = db.query(Department).filter(Department.code == "PWD_ROADS").first()
    dept_sanitation = db.query(Department).filter(Department.code == "SANITATION").first()
    dept_drainage = db.query(Department).filter(Department.code == "DRAINAGE").first()

    # 3. Wards (Faridabad style)
    wards = [
        Ward(
            code="WARD-14",
            name="Ward 14 (Old Faridabad & Central Sector)",
            zone="Central Zone",
            centroid_lat=28.4089,
            centroid_lon=77.3178,
            bounds_geojson='{"type":"Polygon","coordinates":[[[77.310,28.400],[77.325,28.400],[77.325,28.418],[77.310,28.418],[77.310,28.400]]]}',
        ),
        Ward(
            code="WARD-15",
            name="Ward 15 (NIT Industrial & Commercial Belt)",
            zone="NIT Zone",
            centroid_lat=28.3965,
            centroid_lon=77.2990,
            bounds_geojson='{"type":"Polygon","coordinates":[[[77.290,28.388],[77.308,28.388],[77.308,28.405],[77.290,28.405],[77.290,28.388]]]}',
        ),
        Ward(
            code="WARD-16",
            name="Ward 16 (Greenfield & Outer Bypass Corridor)",
            zone="Southern Zone",
            centroid_lat=28.4230,
            centroid_lon=77.3340,
            bounds_geojson='{"type":"Polygon","coordinates":[[[77.325,28.415],[77.345,28.415],[77.345,28.432],[77.325,28.432],[77.325,28.415]]]}',
        ),
    ]
    db.add_all(wards)
    db.commit()

    w14 = db.query(Ward).filter(Ward.code == "WARD-14").first()
    w15 = db.query(Ward).filter(Ward.code == "WARD-15").first()
    w16 = db.query(Ward).filter(Ward.code == "WARD-16").first()

    # 4. Contractors
    contractors = [
        Contractor(
            firm_name="Shivalik Infrabuild Pvt Ltd (Simulated)",
            registration_no="FBD-CONT-2024-089",
            contact_person="R. K. Sharma",
            contact_phone="+91-9811000001",
            rating=4.4,
        ),
        Contractor(
            firm_name="Aravali Civics & Paving Corp (Simulated)",
            registration_no="FBD-CONT-2023-112",
            contact_person="Sunil Verma",
            contact_phone="+91-9811000002",
            rating=4.1,
        ),
        Contractor(
            firm_name="Haryana Highway Solutions (Simulated)",
            registration_no="FBD-CONT-2025-045",
            contact_person="Vikas Yadav",
            contact_phone="+91-9811000003",
            rating=4.6,
        ),
        Contractor(
            firm_name="Bharat Cleanliness Services (Simulated)",
            registration_no="FBD-CONT-2024-019",
            contact_person="Anil Chauhan",
            contact_phone="+91-9811000004",
            rating=3.9,
        ),
    ]
    db.add_all(contractors)
    db.commit()

    c_shivalik = db.query(Contractor).filter(Contractor.firm_name.like("%Shivalik%")).first()
    c_aravali = db.query(Contractor).filter(Contractor.firm_name.like("%Aravali%")).first()
    c_haryana = db.query(Contractor).filter(Contractor.firm_name.like("%Haryana%")).first()
    c_bharat = db.query(Contractor).filter(Contractor.firm_name.like("%Bharat%")).first()

    # 5. Escalation Officers (L1, L2, L3)
    officers = [
        # Roads officers
        Officer(department_id=dept_roads.id, ward_id=w14.id, role="L1_FIELD_ENGINEER", name="Amit Gupta (JE)", email="je.w14@sim-fbd.gov.in", phone="+91-9812000001"),
        Officer(department_id=dept_roads.id, ward_id=w14.id, role="L2_EXECUTIVE_ENGINEER", name="Deepak Rawat (XEN)", email="xen.central@sim-fbd.gov.in", phone="+91-9812000002"),
        Officer(department_id=dept_roads.id, ward_id=w14.id, role="L3_ZONAL_HEAD", name="S. K. Bansal (SE)", email="se.roads@sim-fbd.gov.in", phone="+91-9812000003"),
        # Sanitation officers
        Officer(department_id=dept_sanitation.id, ward_id=w14.id, role="L1_FIELD_ENGINEER", name="Manoj Tanwar (Sanitary Inspector)", email="si.w14@sim-fbd.gov.in", phone="+91-9812000004"),
        Officer(department_id=dept_sanitation.id, ward_id=w14.id, role="L2_EXECUTIVE_ENGINEER", name="Dr. Neeraj Malik (Health Officer)", email="cmo.sanitation@sim-fbd.gov.in", phone="+91-9812000005"),
        Officer(department_id=dept_sanitation.id, ward_id=w14.id, role="L3_ZONAL_HEAD", name="P. C. Rao (Joint Commissioner)", email="jc.sanitation@sim-fbd.gov.in", phone="+91-9812000006"),
    ]
    db.add_all(officers)
    db.commit()

    # 6. Assets (~12 assets across wards)
    assets_data = [
        # Ward 14 assets
        (w14.id, dept_roads.id, "Sector 14 Main Commercial Avenue", "road", 1.5, 28.4095, 77.3180, "Opposite Market Complex, Sector 14"),
        (w14.id, dept_roads.id, "Old Faridabad Station Link Road", "road", 1.4, 28.4110, 77.3150, "Station Road, Old Faridabad"),
        (w14.id, dept_roads.id, "Sector 14 Internal Road 4B", "road", 1.0, 28.4065, 77.3195, "Near Community Center, Sector 14"),
        (w14.id, dept_sanitation.id, "Sector 14 Central Waste Depot", "waste_point", 1.0, 28.4078, 77.3168, "Behind Sector 14 Sub-station"),
        (w14.id, dept_drainage.id, "Sector 14 Storm Drain Channel", "drainage", 1.2, 28.4102, 77.3210, "Adjacent to Green Belt Canal"),

        # Ward 15 assets
        (w15.id, dept_roads.id, "NIT-3 Commercial Ring Road", "road", 1.4, 28.3970, 77.2985, "NIT-3 Main Circle"),
        (w15.id, dept_roads.id, "Neelam Flyover Approach Road", "road", 1.6, 28.3995, 77.3015, "Neelam-Bata Link, Industrial Area"),
        (w15.id, dept_sanitation.id, "NIT Industrial Waste Collection Point", "waste_point", 1.1, 28.3940, 77.2960, "Plot 45, NIT Industrial Area"),
        (w15.id, dept_drainage.id, "Bata Nullah Outfall", "drainage", 1.5, 28.3980, 77.3030, "Near Railway Crossing, Bata Chowk"),

        # Ward 16 assets
        (w16.id, dept_roads.id, "Greenfield Boulevard North", "road", 1.3, 28.4225, 77.3325, "Greenfield Main Gate to Sector 42"),
        (w16.id, dept_roads.id, "Bypass Expressway Service Road", "road", 1.7, 28.4250, 77.3360, "Kilometer 4, Faridabad Bypass"),
        (w16.id, dept_sanitation.id, "Greenfield Sector Dumpster Site", "waste_point", 1.0, 28.4210, 77.3310, "Block B Entry, Greenfield Colony"),
    ]

    assets = []
    for wid, did, name, atype, rimp, lat, lon, addr in assets_data:
        a = Asset(
            ward_id=wid,
            department_id=did,
            name=name,
            asset_type=atype,
            road_importance=rimp,
            latitude=lat,
            longitude=lon,
            address=addr,
        )
        db.add(a)
        assets.append(a)
    db.commit()

    asset_sec14_main = db.query(Asset).filter(Asset.name.like("%Sector 14 Main%")).first()
    asset_station_road = db.query(Asset).filter(Asset.name.like("%Station Link%")).first()
    asset_sec14_internal = db.query(Asset).filter(Asset.name.like("%Internal Road%")).first()
    asset_nit_ring = db.query(Asset).filter(Asset.name.like("%NIT-3 Commercial%")).first()
    asset_neelam = db.query(Asset).filter(Asset.name.like("%Neelam Flyover%")).first()
    asset_greenfield = db.query(Asset).filter(Asset.name.like("%Greenfield Boulevard%")).first()

    # 7. Contracts (6 contracts, including one recently completed with active liability period)
    # Notice: Sector 14 Main Road was completed 4 months ago (June 2026), with defect liability of 24 months!
    # Any defect on it is CONTRACTOR LIABILITY!
    contracts = [
        Contract(
            asset_id=asset_sec14_main.id,
            contractor_id=c_shivalik.id,
            contract_ref="MCF-PWD-2026-C01",
            start_date=datetime.datetime(2025, 10, 1),
            completion_date=datetime.datetime(2026, 6, 15),  # 4 months ago!
            defect_liability_months=24,
            status="COMPLETED",
        ),
        Contract(
            asset_id=asset_station_road.id,
            contractor_id=c_aravali.id,
            contract_ref="MCF-PWD-2024-C12",
            start_date=datetime.datetime(2023, 4, 1),
            completion_date=datetime.datetime(2024, 1, 10),
            defect_liability_months=12,  # Expired
            status="WARRANTY_EXPIRED",
        ),
        Contract(
            asset_id=asset_nit_ring.id,
            contractor_id=c_haryana.id,
            contract_ref="MCF-PWD-2025-C88",
            start_date=datetime.datetime(2025, 1, 15),
            completion_date=datetime.datetime(2025, 11, 20),
            defect_liability_months=24,
            status="ACTIVE",
        ),
        Contract(
            asset_id=asset_neelam.id,
            contractor_id=c_shivalik.id,
            contract_ref="MCF-PWD-2025-C99",
            start_date=datetime.datetime(2025, 5, 1),
            completion_date=datetime.datetime(2025, 12, 10),
            defect_liability_months=24,
            status="ACTIVE",
        ),
        Contract(
            asset_id=asset_greenfield.id,
            contractor_id=c_aravali.id,
            contract_ref="MCF-PWD-2026-C04",
            start_date=datetime.datetime(2026, 2, 1),
            completion_date=datetime.datetime(2026, 8, 30),
            defect_liability_months=36,
            status="COMPLETED",
        ),
        Contract(
            asset_id=asset_sec14_internal.id,
            contractor_id=c_haryana.id,
            contract_ref="MCF-PWD-2024-C55",
            start_date=datetime.datetime(2023, 8, 1),
            completion_date=datetime.datetime(2024, 5, 20),
            defect_liability_months=12,
            status="WARRANTY_EXPIRED",
        ),
    ]
    db.add_all(contracts)
    db.commit()

    # 8. Seed ~30 Cases across all states with real ledger event chaining!
    print("[Seed] Creating ~30 cases across states and appending ledger events...")

    # Helper to check contractor liability
    def check_contractor_liability(asset_id: int, report_date: datetime.datetime) -> Tuple[bool, Optional[int]]:
        contract = db.query(Contract).filter(Contract.asset_id == asset_id).first()
        if not contract:
            return False, None
        end_liability = contract.completion_date + datetime.timedelta(days=contract.defect_liability_months * 30)
        is_liable = contract.completion_date <= report_date <= end_liability
        return is_liable, contract.id

    # Sample template cases (30 diverse cases)
    case_specs = [
        # 1. New / Open cases
        {"id": "CAS-8901", "ward": w14, "dept": dept_roads, "asset": asset_sec14_main, "defect": "pothole", "sev": "High", "state": "Open", "opened_ago_h": 2, "img_key": "pothole1", "title": "Deep pothole near Sector 14 Commercial Axis"},
        {"id": "CAS-8902", "ward": w14, "dept": dept_sanitation, "asset": None, "defect": "garbage", "sev": "Medium", "state": "Open", "opened_ago_h": 6, "img_key": "garbage", "title": "Overflowing community waste bin on Market Road"},
        {"id": "CAS-8903", "ward": w15, "dept": dept_roads, "asset": asset_nit_ring, "defect": "pothole", "sev": "Medium", "state": "Open", "opened_ago_h": 12, "img_key": "pothole2", "title": "Surface bitumen erosion on NIT-3 Circle"},
        {"id": "CAS-8904", "ward": w16, "dept": dept_drainage, "asset": None, "defect": "waterlogging", "sev": "High", "state": "Open", "opened_ago_h": 1, "img_key": "waterlogging", "title": "Standing water logging at Greenfield Entrance"},

        # 2. Assigned cases (clock ticking)
        {"id": "CAS-8905", "ward": w14, "dept": dept_roads, "asset": asset_sec14_main, "defect": "pothole", "sev": "High", "state": "Assigned", "opened_ago_h": 3, "img_key": "pothole1", "title": "Hazardous road crater on Sector 14 Avenue"},
        {"id": "CAS-8906", "ward": w14, "dept": dept_sanitation, "asset": None, "defect": "garbage", "sev": "Low", "state": "Assigned", "opened_ago_h": 10, "img_key": "garbage", "title": "Uncollected street sweepings near Park Gate"},
        {"id": "CAS-8907", "ward": w15, "dept": dept_roads, "asset": asset_neelam, "defect": "pothole", "sev": "High", "state": "Assigned", "opened_ago_h": 2, "img_key": "pothole2", "title": "Pothole on Neelam Flyover ascent"},

        # 3. Acknowledged cases
        {"id": "CAS-8908", "ward": w14, "dept": dept_roads, "asset": asset_station_road, "defect": "pothole", "sev": "Medium", "state": "Acknowledged", "opened_ago_h": 18, "img_key": "pothole1", "title": "Sunken asphalt patch near Railway Station"},
        {"id": "CAS-8909", "ward": w16, "dept": dept_drainage, "asset": None, "defect": "waterlogging", "sev": "Medium", "state": "Acknowledged", "opened_ago_h": 15, "img_key": "waterlogging", "title": "Clogged storm outlet on Bypass Service Lane"},
        {"id": "CAS-8910", "ward": w15, "dept": dept_sanitation, "asset": None, "defect": "garbage", "sev": "Low", "state": "Acknowledged", "opened_ago_h": 22, "img_key": "garbage", "title": "Litter accumulation outside Industrial Gate 2"},

        # 4. Overdue (acknowledgement passed)
        {"id": "CAS-8911", "ward": w14, "dept": dept_roads, "asset": asset_sec14_internal, "defect": "pothole", "sev": "High", "state": "Overdue", "opened_ago_h": 8, "img_key": "pothole1", "title": "Unacknowledged sharp cavity on Lane 4B"},
        {"id": "CAS-8912", "ward": w15, "dept": dept_sanitation, "asset": None, "defect": "garbage", "sev": "Medium", "state": "Overdue", "opened_ago_h": 30, "img_key": "garbage", "title": "Delayed trash removal on NIT Central Spine"},

        # 5. Escalated L1 (escalated to Field Engineer)
        {"id": "CAS-8913", "ward": w14, "dept": dept_roads, "asset": asset_station_road, "defect": "pothole", "sev": "High", "state": "Escalated_L1", "opened_ago_h": 12, "img_key": "pothole2", "title": "Dangerous crater escalated to Junior Engineer"},
        {"id": "CAS-8914", "ward": w16, "dept": dept_roads, "asset": asset_greenfield, "defect": "pothole", "sev": "Medium", "state": "Escalated_L1", "opened_ago_h": 36, "img_key": "pothole1", "title": "Unattended road break escalated to L1 officer"},
        {"id": "CAS-8915", "ward": w15, "dept": dept_drainage, "asset": None, "defect": "waterlogging", "sev": "High", "state": "Escalated_L1", "opened_ago_h": 10, "img_key": "waterlogging", "title": "Bata Nullah overflow L1 ticket"},

        # 6. Escalated L2 (escalated to Executive Engineer)
        {"id": "CAS-8916", "ward": w14, "dept": dept_roads, "asset": asset_sec14_main, "defect": "pothole", "sev": "High", "state": "Escalated_L2", "opened_ago_h": 48, "img_key": "pothole1", "title": "Major road rupture auto-escalated to Executive Engineer"},
        {"id": "CAS-8917", "ward": w15, "dept": dept_sanitation, "asset": None, "defect": "garbage", "sev": "High", "state": "Escalated_L2", "opened_ago_h": 40, "img_key": "garbage", "title": "Illegal industrial dump auto-escalated to Health Officer"},

        # 7. In Progress cases
        {"id": "CAS-8918", "ward": w14, "dept": dept_roads, "asset": asset_sec14_main, "defect": "pothole", "sev": "Medium", "state": "In_Progress", "opened_ago_h": 24, "img_key": "pothole2", "title": "Asphalt patch compaction underway on Avenue"},
        {"id": "CAS-8919", "ward": w16, "dept": dept_roads, "asset": asset_greenfield, "defect": "pothole", "sev": "Low", "state": "In_Progress", "opened_ago_h": 30, "img_key": "pothole1", "title": "Curbside paving repair in progress"},

        # 8. Resolved cases (with verified after-photo evidence)
        {"id": "CAS-8920", "ward": w14, "dept": dept_roads, "asset": asset_sec14_main, "defect": "pothole", "sev": "High", "state": "Resolved", "opened_ago_h": 72, "img_key": "pothole1", "title": "Repaired road segment verified by AI vision"},
        {"id": "CAS-8921", "ward": w15, "dept": dept_sanitation, "asset": None, "defect": "garbage", "sev": "Medium", "state": "Resolved", "opened_ago_h": 60, "img_key": "garbage", "title": "Cleared dumpster site verified by photo evidence"},
        {"id": "CAS-8922", "ward": w16, "dept": dept_drainage, "asset": None, "defect": "waterlogging", "sev": "High", "state": "Resolved", "opened_ago_h": 50, "img_key": "waterlogging", "title": "De-silted drain junction completed"},
        {"id": "CAS-8923", "ward": w14, "dept": dept_roads, "asset": asset_station_road, "defect": "pothole", "sev": "Low", "state": "Resolved", "opened_ago_h": 90, "img_key": "pothole2", "title": "Filling of edge pothole verified"},

        # 9. Closed cases
        {"id": "CAS-8924", "ward": w14, "dept": dept_roads, "asset": asset_sec14_main, "defect": "pothole", "sev": "High", "state": "Closed", "opened_ago_h": 120, "img_key": "pothole1", "title": "Completed asphalt resurfacing case archived"},
        {"id": "CAS-8925", "ward": w15, "dept": dept_sanitation, "asset": None, "defect": "garbage", "sev": "Low", "state": "Closed", "opened_ago_h": 140, "img_key": "garbage", "title": "Waste disposal verified and signed off"},

        # 10. Reopened case (Citizen tapped 'Still Broken' after closure)
        {"id": "CAS-8926", "ward": w14, "dept": dept_roads, "asset": asset_sec14_internal, "defect": "pothole", "sev": "Medium", "state": "Reopened", "opened_ago_h": 96, "img_key": "pothole1", "title": "Settlement occurred after initial patch - Reopened by citizen"},

        # 11. Rejected Closure case (One case where closure attempt was rejected due to defect still detected)
        {"id": "CAS-8927", "ward": w14, "dept": dept_roads, "asset": asset_sec14_main, "defect": "pothole", "sev": "High", "state": "Assigned", "opened_ago_h": 36, "img_key": "pothole1", "title": "Contractor closure rejected: Defect still detected by AI"},

        # 12. Additional operational ward cases
        {"id": "CAS-8928", "ward": w14, "dept": dept_roads, "asset": asset_sec14_main, "defect": "pothole", "sev": "Medium", "state": "Open", "opened_ago_h": 4, "img_key": "pothole2", "title": "Depression forming near bus stop shelter"},
        {"id": "CAS-8929", "ward": w15, "dept": dept_roads, "asset": asset_nit_ring, "defect": "pothole", "sev": "High", "state": "Acknowledged", "opened_ago_h": 14, "img_key": "pothole1", "title": "Large pothole in front of Bank Branch"},
        {"id": "CAS-8930", "ward": w16, "dept": dept_sanitation, "asset": None, "defect": "garbage", "sev": "Medium", "state": "In_Progress", "opened_ago_h": 20, "img_key": "garbage", "title": "Bulky debris clearance scheduled with truck"},
    ]

    for spec in case_specs:
        opened_at = sim_now - datetime.timedelta(hours=spec["opened_ago_h"])
        w = spec["ward"]
        d = spec["dept"]
        a = spec["asset"]
        aid = a.id if a else None

        # Determine SLA deadlines
        sla_hours = 4 if spec["sev"] == "High" else (24 if spec["sev"] == "Medium" else 48)
        sla_days = 3 if spec["sev"] == "High" else (7 if spec["sev"] == "Medium" else 14)
        due_ack = opened_at + datetime.timedelta(hours=sla_hours)
        due_res = opened_at + datetime.timedelta(days=sla_days)

        # Check contractor liability
        is_liable, cid = check_contractor_liability(aid, opened_at) if aid else (False, None)

        case_obj = Case(
            id=spec["id"],
            ward_id=w.id,
            department_id=d.id,
            asset_id=aid,
            contract_id=cid,
            title=spec["title"],
            description=f"Simulated civic complaint in {w.name}. Recorded via mobile application.",
            defect_type=spec["defect"],
            severity=spec["sev"],
            status=spec["state"],
            contractor_liability=is_liable,
            current_escalation_level="L2" if "L2" in spec["state"] else ("L1" if "L1" in spec["state"] else "L1"),
            citizen_phone="+91-9876543210",
            latitude=a.latitude if a else w.centroid_lat + 0.001,
            longitude=a.longitude if a else w.centroid_lon + 0.001,
            address=a.address if a else f"{w.name}, Faridabad",
            opened_at=opened_at,
            due_acknowledge_at=due_ack,
            due_resolve_at=due_res,
            created_at=opened_at,
            updated_at=opened_at,
        )

        db.add(case_obj)
        db.commit()

        # Evidence image lookup
        img_info = evidence_images.get(spec["img_key"]) or evidence_images.get("pothole1")
        if img_info:
            rel_path, sha_hash, p_hash = img_info
            ev = Evidence(
                case_id=case_obj.id,
                evidence_type="original",
                file_path=rel_path,
                sha256_hash=sha_hash,
                perceptual_hash=p_hash,
                latitude=case_obj.latitude,
                longitude=case_obj.longitude,
                captured_at=opened_at,
                submitted_at=opened_at,
                confidence=0.88,
                area_ratio=0.15,
                defect_type=spec["defect"],
                detector_mode="mock",
                metadata_json='{"device":"Citizen Phone","camera":"live_photo_checked"}',
            )
            db.add(ev)
            db.commit()
            orig_ev_hash = sha_hash
        else:
            orig_ev_hash = None

        # ----------------- REAL LEDGER EVENT STREAM -----------------
        # Event 1: Case Reported
        append_event(
            db=db,
            case_id=case_obj.id,
            event_type="CASE_REPORTED",
            actor_role="CITIZEN",
            payload={
                "defect_type": spec["defect"],
                "severity": spec["sev"],
                "ward": w.code,
                "lat": case_obj.latitude,
                "lon": case_obj.longitude,
            },
            evidence_hash=orig_ev_hash,
            timestamp=opened_at,
        )

        # Event 2: AI Verification & Scoring
        append_event(
            db=db,
            case_id=case_obj.id,
            event_type="AI_DEFECT_DETECTED",
            actor_role="SYSTEM_AI",
            payload={
                "defect_classified": spec["defect"],
                "confidence": 0.88,
                "area_ratio": 0.15,
                "severity_assigned": spec["sev"],
                "detector_mode": "mock",
            },
            evidence_hash=orig_ev_hash,
            timestamp=opened_at + datetime.timedelta(seconds=12),
        )

        # Subsequent state changes according to case status
        if spec["state"] in ["Assigned", "Acknowledged", "Overdue", "Escalated_L1", "Escalated_L2", "In_Progress", "Resolved", "Closed", "Reopened"]:
            assigned_at = opened_at + datetime.timedelta(minutes=15)
            append_event(
                db=db,
                case_id=case_obj.id,
                event_type="CASE_ASSIGNED",
                actor_role="SYSTEM_ROUTER",
                payload={
                    "department": d.code,
                    "contractor_liability": is_liable,
                    "contract_ref": "MCF-PWD-2026-C01" if is_liable else None,
                    "ack_deadline": due_ack.isoformat(),
                },
                timestamp=assigned_at,
            )

        if spec["state"] in ["Acknowledged", "In_Progress", "Resolved", "Closed", "Reopened"]:
            ack_at = opened_at + datetime.timedelta(hours=1, minutes=20)
            case_obj.acknowledged_at = ack_at
            db.commit()
            append_event(
                db=db,
                case_id=case_obj.id,
                event_type="CASE_ACKNOWLEDGED",
                actor_role="FIELD_ENGINEER",
                payload={"acknowledged_by": "Field JE", "status": "Acknowledged"},
                timestamp=ack_at,
            )

        if "Escalated_L1" in spec["state"] or "Escalated_L2" in spec["state"]:
            esc_at = due_ack + datetime.timedelta(minutes=10)
            append_event(
                db=db,
                case_id=case_obj.id,
                event_type="ESCALATED_L1",
                actor_role="SYSTEM_SLA",
                payload={
                    "reason": "Acknowledgement SLA breached by Field Engineer",
                    "escalated_to": "Junior Engineer / Assistant Engineer (L1)",
                },
                timestamp=esc_at,
            )

        if "Escalated_L2" in spec["state"]:
            esc2_at = due_ack + datetime.timedelta(hours=24)
            append_event(
                db=db,
                case_id=case_obj.id,
                event_type="ESCALATED_L2",
                actor_role="SYSTEM_SLA",
                payload={
                    "reason": "Resolution SLA breached by L1 officer",
                    "escalated_to": "Executive Engineer (L2)",
                },
                timestamp=esc2_at,
            )

        # Rejected closure scenario for CAS-8927
        if spec["id"] == "CAS-8927":
            closure_attempt_at = opened_at + datetime.timedelta(hours=20)
            append_event(
                db=db,
                case_id=case_obj.id,
                event_type="CLOSURE_SUBMITTED",
                actor_role="CONTRACTOR",
                payload={"attempt": 1, "note": "Contractor reported repair complete"},
                timestamp=closure_attempt_at,
            )
            append_event(
                db=db,
                case_id=case_obj.id,
                event_type="CLOSURE_REJECTED",
                actor_role="SYSTEM_VERIFIER",
                payload={
                    "reason": "Rule 4 violation: Computer vision detected defect with confidence 0.76 (threshold 0.50). Closure denied.",
                    "detector_confidence": 0.76,
                },
                timestamp=closure_attempt_at + datetime.timedelta(seconds=45),
            )

        # Resolved cases
        if spec["state"] in ["Resolved", "Closed"]:
            res_at = opened_at + datetime.timedelta(hours=48)
            case_obj.resolved_at = res_at
            db.commit()

            clean_img = evidence_images.get("clean")
            clean_hash = clean_img[1] if clean_img else None

            append_event(
                db=db,
                case_id=case_obj.id,
                event_type="CLOSURE_VERIFIED",
                actor_role="SYSTEM_VERIFIER",
                payload={
                    "gps_distance_meters": 4.2,
                    "phash_distance": 22,
                    "defect_confidence": 0.04,
                    "verification_result": "ALL_RULES_PASSED",
                },
                evidence_hash=clean_hash,
                timestamp=res_at,
            )
            append_event(
                db=db,
                case_id=case_obj.id,
                event_type="CASE_RESOLVED",
                actor_role="SYSTEM_LEDGER",
                payload={"final_status": "Resolved", "resolution_hours": 48},
                timestamp=res_at + datetime.timedelta(seconds=5),
            )

        # Reopened case scenario
        if spec["state"] == "Reopened":
            reopen_at = opened_at + datetime.timedelta(hours=80)
            append_event(
                db=db,
                case_id=case_obj.id,
                event_type="CASE_REOPENED",
                actor_role="CITIZEN",
                payload={
                    "reason": "Citizen reported defect Still Broken after inspection",
                    "previous_status": "Resolved",
                },
                timestamp=reopen_at,
            )

    # 9. Create periodic external state anchors at checkpoints
    print("[Seed] Creating external anchor checkpoints...")
    create_anchor(db, notes="Seed milestone checkpoint #1 - Initial ward load")
    create_anchor(db, notes="Seed milestone checkpoint #2 - Full simulated complaints state")

    # 10. Run self verification
    v_result = verify_chain(db)
    print(f"[Seed] Seeding complete! Total ledger blocks: {v_result['checked']}. Valid chain: {v_result['valid']}")
    return v_result


def reset_seed_data(db: Session) -> Dict:
    """
    Clears all tables and regenerates the complete simulated state in under 10 seconds.
    """
    Base.metadata.create_all(bind=engine)
    # Truncate tables cleanly
    db.query(Event).delete()
    db.query(Anchor).delete()
    db.query(Evidence).delete()
    db.query(Notification).delete()
    db.query(OtpSession).delete()
    db.query(Case).delete()
    db.query(Contract).delete()
    db.query(Asset).delete()
    db.query(Officer).delete()
    db.query(Contractor).delete()
    db.query(Department).delete()
    db.query(Ward).delete()
    db.query(SlaPolicy).delete()
    db.commit()

    return seed_database(db)


if __name__ == "__main__":
    from database import SessionLocal
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    try:
        reset_seed_data(session)
    finally:
        session.close()
