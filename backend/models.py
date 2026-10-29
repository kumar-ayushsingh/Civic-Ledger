import datetime
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import relationship
from database import Base


class Ward(Base):
    __tablename__ = "wards"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(32), unique=True, index=True, nullable=False)
    name = Column(String(128), nullable=False)
    zone = Column(String(64), nullable=False)
    centroid_lat = Column(Float, nullable=False)
    centroid_lon = Column(Float, nullable=False)
    bounds_geojson = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    assets = relationship("Asset", back_populates="ward")
    cases = relationship("Case", back_populates="ward")


class Department(Base):
    __tablename__ = "departments"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(32), unique=True, index=True, nullable=False)
    name = Column(String(128), nullable=False)
    description = Column(Text, nullable=True)
    contact_email = Column(String(128), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    officers = relationship("Officer", back_populates="department")
    assets = relationship("Asset", back_populates="department")
    cases = relationship("Case", back_populates="department")


class Officer(Base):
    __tablename__ = "officers"

    id = Column(Integer, primary_key=True, index=True)
    department_id = Column(Integer, ForeignKey("departments.id"), index=True, nullable=False)
    ward_id = Column(Integer, ForeignKey("wards.id"), index=True, nullable=True)
    role = Column(String(32), index=True, nullable=False)  # L1_FIELD_ENGINEER, L2_EXECUTIVE_ENGINEER, L3_ZONAL_HEAD
    name = Column(String(128), nullable=False)
    email = Column(String(128), nullable=True)
    phone = Column(String(32), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    department = relationship("Department", back_populates="officers")


class Contractor(Base):
    __tablename__ = "contractors"

    id = Column(Integer, primary_key=True, index=True)
    firm_name = Column(String(128), index=True, nullable=False)
    registration_no = Column(String(64), unique=True, index=True, nullable=False)
    contact_person = Column(String(128), nullable=True)
    contact_phone = Column(String(32), nullable=True)
    rating = Column(Float, default=4.2)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    contracts = relationship("Contract", back_populates="contractor")


class Asset(Base):
    __tablename__ = "assets"

    id = Column(Integer, primary_key=True, index=True)
    ward_id = Column(Integer, ForeignKey("wards.id"), index=True, nullable=False)
    department_id = Column(Integer, ForeignKey("departments.id"), index=True, nullable=False)
    name = Column(String(128), index=True, nullable=False)
    asset_type = Column(String(64), nullable=False)  # road, drainage, waste_point
    road_importance = Column(Float, default=1.0)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    address = Column(String(256), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    ward = relationship("Ward", back_populates="assets")
    department = relationship("Department", back_populates="assets")
    contracts = relationship("Contract", back_populates="asset")
    cases = relationship("Case", back_populates="asset")


class Contract(Base):
    __tablename__ = "contracts"

    id = Column(Integer, primary_key=True, index=True)
    asset_id = Column(Integer, ForeignKey("assets.id"), index=True, nullable=False)
    contractor_id = Column(Integer, ForeignKey("contractors.id"), index=True, nullable=False)
    contract_ref = Column(String(64), unique=True, index=True, nullable=False)
    start_date = Column(DateTime, nullable=False)
    completion_date = Column(DateTime, nullable=False, index=True)
    defect_liability_months = Column(Integer, default=24)
    status = Column(String(32), default="ACTIVE", index=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    asset = relationship("Asset", back_populates="contracts")
    contractor = relationship("Contractor", back_populates="contracts")
    cases = relationship("Case", back_populates="contract")


class SlaPolicy(Base):
    __tablename__ = "sla_policies"

    id = Column(Integer, primary_key=True, index=True)
    severity = Column(String(16), unique=True, index=True, nullable=False)  # Low, Medium, High
    acknowledge_time_hours = Column(Integer, nullable=False)
    resolve_time_days = Column(Integer, nullable=False)
    description = Column(String(256), nullable=True)


class Case(Base):
    __tablename__ = "cases"

    id = Column(String(32), primary_key=True, index=True)  # e.g. CAS-8901
    ward_id = Column(Integer, ForeignKey("wards.id"), index=True, nullable=False)
    department_id = Column(Integer, ForeignKey("departments.id"), index=True, nullable=False)
    asset_id = Column(Integer, ForeignKey("assets.id"), index=True, nullable=True)
    contract_id = Column(Integer, ForeignKey("contracts.id"), index=True, nullable=True)
    title = Column(String(256), nullable=False)
    description = Column(Text, nullable=True)
    defect_type = Column(String(64), index=True, nullable=False)
    severity = Column(String(16), index=True, nullable=False)  # Low, Medium, High
    status = Column(String(32), index=True, nullable=False)  # Open, Assigned, Acknowledged, In_Progress, Escalated_L1, Escalated_L2, Resolved, Closed, Reopened
    contractor_liability = Column(Boolean, default=False, index=True)
    current_escalation_level = Column(String(16), default="L1", index=True)  # L1, L2, L3
    citizen_phone = Column(String(32), nullable=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    address = Column(String(256), nullable=True)
    opened_at = Column(DateTime, default=datetime.datetime.utcnow, index=True)
    acknowledged_at = Column(DateTime, nullable=True)
    resolved_at = Column(DateTime, nullable=True)
    due_acknowledge_at = Column(DateTime, nullable=True, index=True)
    due_resolve_at = Column(DateTime, nullable=True, index=True)
    is_duplicate_of = Column(String(32), ForeignKey("cases.id"), nullable=True)
    supporting_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    ward = relationship("Ward", back_populates="cases")
    department = relationship("Department", back_populates="cases")
    asset = relationship("Asset", back_populates="cases")
    contract = relationship("Contract", back_populates="cases")
    evidence = relationship("Evidence", back_populates="case")
    events = relationship("Event", back_populates="case")


class Evidence(Base):
    __tablename__ = "evidence"

    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(String(32), ForeignKey("cases.id"), index=True, nullable=False)
    evidence_type = Column(String(32), index=True, nullable=False)  # original, supporting, after_repair, rejected_closure
    file_path = Column(String(256), nullable=False)
    sha256_hash = Column(String(64), index=True, nullable=False)
    perceptual_hash = Column(String(64), index=True, nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    captured_at = Column(DateTime, nullable=True)
    submitted_at = Column(DateTime, default=datetime.datetime.utcnow)
    confidence = Column(Float, nullable=True)
    area_ratio = Column(Float, nullable=True)
    defect_type = Column(String(64), nullable=True)
    detector_mode = Column(String(32), default="mock")
    metadata_json = Column(Text, nullable=True)

    case = relationship("Case", back_populates="evidence")


class Event(Base):
    """
    The SHA-256 Tamper-Evident Ledger.
    Every state change appends one event.
    hash = sha256(prev_hash + canonical_json(event));
    canonical_json = json.dumps(sort_keys=True, separators=(',', ':'));
    genesis prev_hash is 64 zeros.
    """
    __tablename__ = "events"

    id = Column(Integer, primary_key=True, index=True)
    sequence = Column(Integer, unique=True, index=True, nullable=False)
    case_id = Column(String(32), ForeignKey("cases.id"), index=True, nullable=True)
    event_type = Column(String(64), index=True, nullable=False)
    actor_role = Column(String(64), index=True, nullable=False)
    payload = Column(Text, nullable=False)
    evidence_hash = Column(String(64), index=True, nullable=True)
    prev_hash = Column(String(64), index=True, nullable=False)
    own_hash = Column(String(64), unique=True, index=True, nullable=False)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow, index=True)

    case = relationship("Case", back_populates="events")

    __table_args__ = (
        Index("idx_events_seq_hash", "sequence", "own_hash"),
    )


class Anchor(Base):
    """
    Periodic anchors storing sequence and head hash.
    Used to detect if the whole chain has been rewritten.
    """
    __tablename__ = "anchors"

    id = Column(Integer, primary_key=True, index=True)
    sequence = Column(Integer, index=True, nullable=False)
    head_hash = Column(String(64), index=True, nullable=False)
    notes = Column(String(256), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(String(32), ForeignKey("cases.id"), index=True, nullable=True)
    recipient_role = Column(String(64), nullable=False)
    recipient_contact = Column(String(128), nullable=False)
    message = Column(Text, nullable=False)
    channel = Column(String(32), default="SMS")
    status = Column(String(32), default="SENT")
    sent_at = Column(DateTime, default=datetime.datetime.utcnow)


class Setting(Base):
    __tablename__ = "settings"

    key = Column(String(64), primary_key=True)
    value = Column(Text, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)


class OtpSession(Base):
    __tablename__ = "otp_sessions"

    id = Column(Integer, primary_key=True, index=True)
    phone = Column(String(32), index=True, nullable=False)
    otp_code = Column(String(8), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    verified = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
