import datetime
import hashlib
import json
from typing import Any, Dict, Optional
from sqlalchemy.orm import Session
from models import Anchor, Event

GENESIS_PREV_HASH = "0" * 64


def canonical_json(data: Any) -> str:
    """
    Canonical JSON encoder: sorted keys, no whitespace separators.
    Exact rule: json.dumps(sort_keys=True, separators=(',', ':'))
    """
    return json.dumps(data, sort_keys=True, separators=(",", ":"))


def make_canonical_event_dict(
    sequence: int,
    case_id: Optional[str],
    event_type: str,
    actor_role: str,
    payload: Any,
    evidence_hash: Optional[str],
    timestamp_str: str,
) -> Dict[str, Any]:
    """
    Canonical structure for hashing event contents.
    """
    return {
        "actor_role": str(actor_role),
        "case_id": str(case_id or ""),
        "event_type": str(event_type),
        "evidence_hash": str(evidence_hash or ""),
        "payload": payload,
        "sequence": int(sequence),
        "timestamp": str(timestamp_str),
    }


def compute_event_hash(prev_hash: str, event_dict: Dict[str, Any]) -> str:
    """
    hash = sha256(prev_hash + canonical_json(event))
    """
    canonical_str = canonical_json(event_dict)
    combined = prev_hash + canonical_str
    return hashlib.sha256(combined.encode("utf-8")).hexdigest()


def append_event(
    db: Session,
    case_id: Optional[str],
    event_type: str,
    actor_role: str,
    payload: Any,
    evidence_hash: Optional[str] = None,
    timestamp: Optional[datetime.datetime] = None,
) -> Event:
    """
    Appends one tamper-evident event to the ledger chain.
    """
    # 1. Determine next sequence and prev_hash
    last_event = db.query(Event).order_by(Event.sequence.desc()).first()
    if last_event is None:
        sequence = 1
        prev_hash = GENESIS_PREV_HASH
    else:
        sequence = last_event.sequence + 1
        prev_hash = last_event.own_hash

    # 2. Standardize timestamp
    ts = timestamp or datetime.datetime.utcnow()
    ts_clean = ts.replace(microsecond=0)
    ts_str = ts_clean.isoformat()

    # 3. Canonicalize payload
    if isinstance(payload, dict):
        payload_obj = payload
        payload_canonical = canonical_json(payload)
    elif isinstance(payload, str):
        try:
            payload_obj = json.loads(payload)
            payload_canonical = canonical_json(payload_obj)
        except Exception:
            payload_obj = payload
            payload_canonical = payload
    else:
        payload_obj = payload
        payload_canonical = canonical_json(payload)

    # 4. Form canonical event dict and compute own_hash
    event_dict = make_canonical_event_dict(
        sequence=sequence,
        case_id=case_id,
        event_type=event_type,
        actor_role=actor_role,
        payload=payload_obj,
        evidence_hash=evidence_hash,
        timestamp_str=ts_str,
    )

    own_hash = compute_event_hash(prev_hash, event_dict)

    # 5. Persist to database
    new_event = Event(
        sequence=sequence,
        case_id=case_id,
        event_type=event_type,
        actor_role=actor_role,
        payload=payload_canonical,
        evidence_hash=evidence_hash,
        prev_hash=prev_hash,
        own_hash=own_hash,
        timestamp=ts_clean,
    )
    db.add(new_event)
    db.commit()
    db.refresh(new_event)
    return new_event


def verify_chain(db: Session) -> Dict[str, Any]:
    """
    Recomputes the entire chain from genesis.
    Returns:
      {
        "valid": bool,
        "checked": int,
        "first_broken_sequence": Optional[int]
      }
    """
    events = db.query(Event).order_by(Event.sequence.asc()).all()
    if not events:
        return {"valid": True, "checked": 0, "first_broken_sequence": None}

    expected_prev_hash = GENESIS_PREV_HASH
    expected_sequence = 1
    checked_count = 0

    for event in events:
        # Check sequence continuity
        if event.sequence != expected_sequence:
            return {
                "valid": False,
                "checked": checked_count,
                "first_broken_sequence": event.sequence,
                "reason": f"Sequence gap: expected {expected_sequence}, found {event.sequence}",
            }

        # Check prev_hash pointer
        if event.prev_hash != expected_prev_hash:
            return {
                "valid": False,
                "checked": checked_count,
                "first_broken_sequence": event.sequence,
                "reason": f"Hash mismatch at sequence {event.sequence}: prev_hash does not match previous own_hash",
            }

        # Recompute own_hash from payload and metadata
        ts_clean = event.timestamp.replace(microsecond=0)
        ts_str = ts_clean.isoformat()

        try:
            payload_obj = json.loads(event.payload)
        except Exception:
            payload_obj = event.payload

        event_dict = make_canonical_event_dict(
            sequence=event.sequence,
            case_id=event.case_id,
            event_type=event.event_type,
            actor_role=event.actor_role,
            payload=payload_obj,
            evidence_hash=event.evidence_hash,
            timestamp_str=ts_str,
        )

        recomputed_hash = compute_event_hash(event.prev_hash, event_dict)
        if event.own_hash != recomputed_hash:
            return {
                "valid": False,
                "checked": checked_count,
                "first_broken_sequence": event.sequence,
                "reason": f"Content tampering at sequence {event.sequence}: recorded hash != recomputed hash",
            }

        expected_prev_hash = event.own_hash
        expected_sequence += 1
        checked_count += 1

    return {"valid": True, "checked": checked_count, "first_broken_sequence": None}


def create_anchor(db: Session, notes: Optional[str] = None) -> Optional[Anchor]:
    """
    Takes a snapshot anchor of the current head of the ledger chain.
    """
    latest_event = db.query(Event).order_by(Event.sequence.desc()).first()
    if not latest_event:
        return None

    anchor = Anchor(
        sequence=latest_event.sequence,
        head_hash=latest_event.own_hash,
        notes=notes or f"External state anchor at block #{latest_event.sequence}",
        created_at=datetime.datetime.utcnow(),
    )
    db.add(anchor)
    db.commit()
    db.refresh(anchor)
    return anchor


def verify_against_anchors(db: Session) -> Dict[str, Any]:
    """
    Verifies that all recorded anchors match the current state of the events table.
    Detects if the whole chain has been rewritten from a certain sequence.
    """
    anchors = db.query(Anchor).order_by(Anchor.sequence.asc()).all()
    if not anchors:
        return {
            "anchors_valid": True,
            "total_anchors": 0,
            "mismatches": [],
        }

    mismatches = []
    for anchor in anchors:
        event = db.query(Event).filter(Event.sequence == anchor.sequence).first()
        if not event:
            mismatches.append({
                "sequence": anchor.sequence,
                "expected_hash": anchor.head_hash,
                "actual_hash": None,
                "error": f"Block #{anchor.sequence} missing from events table",
            })
        elif event.own_hash != anchor.head_hash:
            mismatches.append({
                "sequence": anchor.sequence,
                "expected_hash": anchor.head_hash,
                "actual_hash": event.own_hash,
                "error": f"Anchor mismatch at block #{anchor.sequence}",
            })

    return {
        "anchors_valid": len(mismatches) == 0,
        "total_anchors": len(anchors),
        "mismatches": mismatches,
    }
