"""OpenStreetMap import: fetch the course area and convert golf features to GeoJSON."""

import json
import re
from pathlib import Path

import requests
from shapely.geometry import LineString, Point, Polygon, mapping

from .geo import Local

UA = "golf-course-builder/0.1"
HOLE_RADIUS_M = 60.0

GOLF_KINDS = {
    "green": "green",
    "fairway": "fairway",
    "tee": "tee",
    "bunker": "bunker",
    "water_hazard": "water",
    "lateral_water_hazard": "water",
    "rough": "rough",
    "cartpath": "cartpath",
    "clubhouse": "clubhouse",
    "out_of_bounds": "ob",
}
LINE_KINDS = {"cartpath"}
NO_HOLE_KINDS = {"clubhouse", "ob"}


def fetch_osm(bbox, cache_path: Path | None = None) -> dict:
    """bbox = (w, s, e, n). The main API works more reliably than Overpass here."""
    if cache_path and cache_path.exists():
        return json.loads(cache_path.read_text())
    w, s, e, n = bbox
    r = requests.get(
        f"https://api.openstreetmap.org/api/0.6/map.json?bbox={w},{s},{e},{n}",
        headers={"User-Agent": UA},
        timeout=120,
    )
    r.raise_for_status()
    data = r.json()
    if cache_path:
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        cache_path.write_text(json.dumps(data))
    return data


def _index(osm):
    nodes = {e["id"]: e for e in osm["elements"] if e["type"] == "node"}
    ways = {e["id"]: e for e in osm["elements"] if e["type"] == "way"}
    return nodes, ways


def _coords(way, nodes):
    return [(nodes[i]["lon"], nodes[i]["lat"]) for i in way["nodes"] if i in nodes]


def _kind(tags) -> str | None:
    if tags.get("golf") in GOLF_KINDS:
        return GOLF_KINDS[tags["golf"]]
    if tags.get("natural") == "water":
        return "water"
    if tags.get("natural") == "wood" or tags.get("landuse") == "forest":
        return "trees"
    return None


def boundary_polygon(osm, boundary_way_id) -> Polygon:
    nodes, ways = _index(osm)
    return Polygon(_coords(ways[boundary_way_id], nodes))


def hole_ways(osm) -> list[dict]:
    nodes, ways = _index(osm)
    out = []
    for w in ways.values():
        t = w.get("tags", {})
        if t.get("golf") == "hole" and t.get("ref", "").isdigit():
            out.append({"ref": int(t["ref"]), "tags": t, "coords": _coords(w, nodes)})
    return sorted(out, key=lambda h: h["ref"])


def osm_to_features(osm: dict, boundary_way_id: int) -> dict:
    nodes, ways = _index(osm)
    boundary = boundary_polygon(osm, boundary_way_id)
    c = boundary.centroid
    loc = Local(c.x, c.y)
    holes = [(h["ref"], loc.to_m(LineString(h["coords"]))) for h in hole_ways(osm)]
    feats = []
    for w in ways.values():
        if w["id"] == boundary_way_id:
            continue
        kind = _kind(w.get("tags", {}))
        if not kind:
            continue
        pts = _coords(w, nodes)
        closed = len(pts) >= 4 and pts[0] == pts[-1]
        if kind in LINE_KINDS or not closed:
            if len(pts) < 2:
                continue
            geom = LineString(pts)
        else:
            geom = Polygon(pts)
        if not boundary.intersects(geom):
            continue
        feats.append(
            {
                "type": "Feature",
                "properties": {
                    "id": f"osm-way-{w['id']}",
                    "kind": kind,
                    "hole": None
                    if kind in NO_HOLE_KINDS
                    else _nearest_hole(loc.to_m(geom), kind, holes),
                    "source": "osm",
                    "confidence": 1.0,
                },
                "geometry": mapping(geom),
            }
        )
    feats.sort(key=lambda f: f["properties"]["id"])
    return {"type": "FeatureCollection", "features": feats}


def _nearest_hole(geom_m, kind, holes):
    best, best_d = None, HOLE_RADIUS_M
    for ref, line in holes:
        # greens belong to the hole that ends there; tees to the hole that starts there
        if kind == "green":
            d = geom_m.distance(Point(line.coords[-1]))
        elif kind == "tee":
            d = geom_m.distance(Point(line.coords[0]))
        else:
            d = geom_m.distance(line)
        if d <= best_d:
            best, best_d = ref, d
    return best


def normalize_phone(raw: str) -> str | None:
    """US numbers → E.164. Returns None when it is not a full number."""
    digits = re.sub(r"\D", "", raw or "")
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]
    if len(digits) != 10:
        return None
    return f"+1{digits}"


def contacts_from_boundary(osm: dict, boundary_way_id: int) -> dict:
    _, ways = _index(osm)
    t = ways[boundary_way_id].get("tags", {})
    contacts = []
    phone = normalize_phone(t.get("phone") or t.get("contact:phone") or "")
    if phone:
        contacts.append({"label": "Pro shop", "phone": phone})
    street = " ".join(x for x in (t.get("addr:housenumber"), t.get("addr:street")) if x)
    tail = " ".join(x for x in (t.get("addr:state"), t.get("addr:postcode")) if x)
    address = ", ".join(x for x in (street, t.get("addr:city"), tail) if x)
    return {
        "name": t.get("name", ""),
        "address": address,
        "website": t.get("website") or t.get("contact:website"),
        "contacts": contacts,
        "par": int(t["golf:par"]) if t.get("golf:par", "").isdigit() else None,
    }
