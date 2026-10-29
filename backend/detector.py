import hashlib
import io
import os
from typing import Any, Dict, List, Optional
from PIL import Image

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "models", "pothole.pt")

# Global in-memory override for demo testing
_DEMO_OVERRIDE: Optional[Dict[str, Any]] = None


def set_demo_override(override_data: Optional[Dict[str, Any]]):
    """Sets or clears detector demo override for simulation tests."""
    global _DEMO_OVERRIDE
    _DEMO_OVERRIDE = override_data


def get_demo_override() -> Optional[Dict[str, Any]]:
    return _DEMO_OVERRIDE


def detect(
    image_bytes: bytes,
    filename: Optional[str] = None,
    override: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Core detector interface:
    detect(image_bytes) -> {type, confidence, bbox, area_ratio, mode}
    mode is 'mock', 'yolo' or 'mock-fallback'.
    Mock is deterministic.
    """
    # 1. Check override
    active_override = override or _DEMO_OVERRIDE
    if active_override:
        return {
            "type": active_override.get("type", "pothole"),
            "confidence": float(active_override.get("confidence", 0.90)),
            "bbox": active_override.get("bbox", [0.2, 0.3, 0.7, 0.75]),
            "area_ratio": float(active_override.get("area_ratio", 0.18)),
            "mode": "mock",
        }

    # 2. Check YOLO path if model file exists
    if os.path.exists(MODEL_PATH):
        try:
            from ultralytics import YOLO  # type: ignore
            model = YOLO(MODEL_PATH)
            img = Image.open(io.BytesIO(image_bytes))
            results = model.predict(img, conf=0.25, verbose=False)
            if results and len(results[0].boxes) > 0:
                box = results[0].boxes[0]
                cls_id = int(box.cls[0].item())
                cls_name = results[0].names.get(cls_id, "pothole")
                conf = float(box.conf[0].item())
                xyxy = [float(x) for x in box.xyxy[0].tolist()]
                w, h = img.size
                norm_box = [xyxy[0] / w, xyxy[1] / h, xyxy[2] / w, xyxy[3] / h]
                box_area = (xyxy[2] - xyxy[0]) * (xyxy[3] - xyxy[1])
                area_ratio = round(box_area / (w * h), 4)
                return {
                    "type": cls_name,
                    "confidence": round(conf, 3),
                    "bbox": norm_box,
                    "area_ratio": area_ratio,
                    "mode": "yolo",
                }
            else:
                return {
                    "type": "clean",
                    "confidence": 0.05,
                    "bbox": None,
                    "area_ratio": 0.0,
                    "mode": "yolo",
                }
        except Exception:
            # Fallback to mock if YOLO execution fails
            mode_tag = "mock-fallback"
    else:
        mode_tag = "mock"

    # 3. Deterministic Mock
    # Keyword-based matching if filename is provided
    fn_lower = (filename or "").lower()

    if any(k in fn_lower for k in ["clean", "pothole free", "repaired", "fixed"]):
        return {
            "type": "clean",
            "confidence": 0.04,
            "bbox": None,
            "area_ratio": 0.0,
            "mode": mode_tag,
        }
    elif any(k in fn_lower for k in ["unrelated", "dog", "random", "cat", "selfie"]):
        return {
            "type": "unrelated",
            "confidence": 0.02,
            "bbox": None,
            "area_ratio": 0.0,
            "mode": mode_tag,
        }
    elif any(k in fn_lower for k in ["garbage", "waste", "trash", "overpiling"]):
        return {
            "type": "garbage",
            "confidence": 0.87,
            "bbox": [0.20, 0.35, 0.80, 0.85],
            "area_ratio": 0.24,
            "mode": mode_tag,
        }
    elif any(k in fn_lower for k in ["waterlog", "flood", "drain", "sewage"]):
        return {
            "type": "waterlogging",
            "confidence": 0.84,
            "bbox": [0.15, 0.45, 0.85, 0.90],
            "area_ratio": 0.28,
            "mode": mode_tag,
        }
    elif any(k in fn_lower for k in ["pothole", "crater", "asphalt", "road_defect"]):
        return {
            "type": "pothole",
            "confidence": 0.89,
            "bbox": [0.25, 0.35, 0.70, 0.75],
            "area_ratio": 0.16,
            "mode": mode_tag,
        }

    # Hash-based deterministic fallback on raw image bytes
    if not image_bytes:
        return {
            "type": "unrelated",
            "confidence": 0.0,
            "bbox": None,
            "area_ratio": 0.0,
            "mode": mode_tag,
        }

    val = int(hashlib.sha256(image_bytes).hexdigest()[:8], 16)
    selector = val % 4
    if selector == 0:
        return {
            "type": "pothole",
            "confidence": 0.86,
            "bbox": [0.22, 0.32, 0.68, 0.72],
            "area_ratio": 0.15,
            "mode": mode_tag,
        }
    elif selector == 1:
        return {
            "type": "garbage",
            "confidence": 0.82,
            "bbox": [0.18, 0.40, 0.78, 0.82],
            "area_ratio": 0.20,
            "mode": mode_tag,
        }
    elif selector == 2:
        return {
            "type": "waterlogging",
            "confidence": 0.80,
            "bbox": [0.14, 0.42, 0.84, 0.88],
            "area_ratio": 0.25,
            "mode": mode_tag,
        }
    else:
        return {
            "type": "clean",
            "confidence": 0.08,
            "bbox": None,
            "area_ratio": 0.0,
            "mode": mode_tag,
        }
