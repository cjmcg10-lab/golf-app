"""Merge OSM, AI-proposed and manual features. Priority: manual > osm > ai."""

from shapely.geometry import shape

IOU_DUPLICATE = 0.5


def _iou(a, b) -> float:
    if not a.intersects(b):
        return 0.0
    inter = a.intersection(b).area
    union = a.union(b).area
    return inter / union if union else 0.0


def _overlaps(a, b) -> bool:
    if a.area == 0 or b.area == 0:  # lines: treat as same if they are very close
        return a.distance(b) < 1e-6 and a.length and abs(a.length - b.length) / a.length < 0.2
    return _iou(a, b) > IOU_DUPLICATE


def merge_features(osm_fc: dict, ai_fc: dict | None, manual_fc: dict | None) -> dict:
    manual = (manual_fc or {}).get("features", [])
    removes = [shape(f["geometry"]) for f in manual if f["properties"].get("remove")]
    manual = [f for f in manual if not f["properties"].get("remove")]
    manual_geoms = [(f["properties"]["kind"], shape(f["geometry"])) for f in manual]

    def dropped(f) -> bool:
        g = shape(f["geometry"])
        if any(_overlaps(g, r) or r.contains(g) for r in removes):
            return True
        return any(k == f["properties"]["kind"] and _overlaps(g, mg) for k, mg in manual_geoms)

    out = [f for f in osm_fc["features"] if not dropped(f)]
    kept_osm = [(f["properties"]["kind"], shape(f["geometry"])) for f in out]
    for f in (ai_fc or {}).get("features", []):
        if dropped(f):
            continue
        g = shape(f["geometry"])
        if any(k == f["properties"]["kind"] and _overlaps(g, og) for k, og in kept_osm):
            continue
        out.append(f)
    out.extend(manual)
    return {"type": "FeatureCollection", "features": out}
