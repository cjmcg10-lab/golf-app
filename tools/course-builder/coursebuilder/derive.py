"""Derive holes (play line, pin, green front/centre/back, yardage) from OSM + features."""

from shapely.geometry import LineString, Point, shape

from .geo import Local, geodesic_yards
from .osm import _index, hole_ways

PIN_MAX_M = 30.0


def derive_holes(osm: dict, features: dict) -> list[dict]:
    nodes, _ = _index(osm)
    pins = [(n["lon"], n["lat"]) for n in nodes.values() if n.get("tags", {}).get("golf") == "pin"]
    greens = {}
    for f in features["features"]:
        p = f["properties"]
        if p["kind"] == "green" and p["hole"] is not None:
            greens.setdefault(p["hole"], []).append(shape(f["geometry"]))
    out = []
    for h in hole_ways(osm):
        coords = h["coords"]
        loc = Local(*coords[-1])
        end = Point(coords[-1])
        cands = greens.get(h["ref"], [])
        green = min(cands, key=lambda g: g.distance(end)) if cands else None
        if green is not None:
            front, center, back = _front_center_back(coords, green, loc)
            pin = _pin(pins, green, loc) or center
        else:
            front = center = back = pin = list(coords[-1])
        play = [list(p) for p in coords[:-1]] + [center]
        t = h["tags"]
        out.append(
            {
                "number": h["ref"],
                "par": int(t["par"]) if t.get("par", "").isdigit() else None,
                "handicap": int(t["handicap"]) if t.get("handicap", "").isdigit() else None,
                "playLine": play,
                "measuredYards": round(geodesic_yards(play)),
                "yards": {},
                "pin": pin,
                "green": {"front": front, "center": center, "back": back},
                "featureIds": sorted(
                    f["properties"]["id"]
                    for f in features["features"]
                    if f["properties"]["hole"] == h["ref"]
                ),
            }
        )
    return out


def _front_center_back(coords, green, loc: Local):
    a = loc.to_m(Point(coords[-2]))
    b = loc.to_m(Point(coords[-1]))
    g = loc.to_m(green)
    dx, dy = b.x - a.x, b.y - a.y
    n = (dx * dx + dy * dy) ** 0.5 or 1.0
    ux, uy = dx / n, dy / n
    # aim the line through the green's centroid along the last segment's direction
    c = g.centroid
    ray = LineString([(c.x - ux * 500, c.y - uy * 500), (c.x + ux * 500, c.y + uy * 500)])
    inside = ray.intersection(g)
    if inside.is_empty:
        p = [round(v, 7) for v in loc.to_ll(c).coords[0]]
        return p, p, p
    pts = [Point(x, y) for x, y in _all_coords(inside)]
    start = Point(c.x - ux * 500, c.y - uy * 500)
    pts.sort(key=start.distance)
    f, k = pts[0], pts[-1]
    mid = Point((f.x + k.x) / 2, (f.y + k.y) / 2)
    return [[round(v, 7) for v in loc.to_ll(p).coords[0]] for p in (f, mid, k)]


def _all_coords(geom):
    if hasattr(geom, "geoms"):
        for g in geom.geoms:
            yield from g.coords
    else:
        yield from geom.coords


def _pin(pins, green, loc: Local):
    gm = loc.to_m(green)
    best, best_d = None, PIN_MAX_M
    for p in pins:
        d = gm.distance(loc.to_m(Point(p)))
        if d <= best_d:
            best, best_d = list(p), d
    return best
