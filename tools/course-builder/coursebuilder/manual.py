"""Manual per-course data (manual.yaml): facts no dataset has. Values override derived ones."""

from pathlib import Path

import yaml

from .geo import geodesic_yards
from .osm import normalize_phone


def load_manual(path: Path) -> dict:
    if not path.exists():
        return {}
    return yaml.safe_load(path.read_text()) or {}


def apply_manual(course: dict, manual: dict) -> dict:
    out = dict(course)
    for key in ("website", "address", "name"):
        if manual.get(key):
            out[key] = manual[key]
    if "contacts" in manual:
        contacts = []
        for c in manual["contacts"]:
            phone = normalize_phone(str(c["phone"]))
            if phone is None:
                raise ValueError(f"manual contact {c['label']!r} has an incomplete phone number")
            contacts.append({"label": c["label"], "phone": phone})
        out["contacts"] = contacts
    if "teeSets" in manual:
        out["teeSets"] = [
            {
                "id": t["id"],
                "name": t["name"],
                "color": t.get("color"),
                "rating": t.get("rating"),
                "slope": t.get("slope"),
            }
            for t in manual["teeSets"]
        ]
    holes_manual = {int(k): v for k, v in (manual.get("holes") or {}).items()}
    holes = []
    for h in course.get("holes", []):
        h = dict(h)
        m = holes_manual.get(h["number"], {})
        if "handicap" in m:
            h["handicap"] = m["handicap"]
        if "par" in m:
            h["par"] = m["par"]
        if "yards" in m:
            h["yards"] = dict(m["yards"])
        if "tee" in m:
            # back tee located from imagery when the OSM hole line starts at the wrong tee
            h["playLine"] = [list(m["tee"]), *h["playLine"][1:]]
            h["measuredYards"] = round(geodesic_yards(h["playLine"]))
        holes.append(h)
    out["holes"] = holes
    return out
