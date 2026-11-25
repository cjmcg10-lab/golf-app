"""Scenery around the course for the 3D view: buildings, roads and parking from OpenStreetMap.

Unlike features.geojson (golf features inside the course boundary) this covers the whole terrain
area, so the houses and streets around the course show up too."""

import re

from shapely.geometry import LineString, Polygon, box, mapping

from .osm import _coords, _index

ROAD_WIDTH_M = {
    "motorway": 12.0,
    "trunk": 10.0,
    "primary": 9.0,
    "secondary": 8.0,
    "tertiary": 7.0,
    "residential": 6.0,
    "unclassified": 6.0,
    "service": 4.0,
    "footway": 1.5,
    "path": 1.5,
}


def building_height(tags: dict) -> float:
    m = re.match(r"\s*([\d.]+)", tags.get("height", ""))
    if m:
        return float(m.group(1))
    if tags.get("building:levels", "").isdigit():
        return int(tags["building:levels"]) * 3.0 + 1.0
    if tags.get("building") in ("church", "cathedral"):
        return 14.0
    return 6.0


def osm_to_scenery(osm: dict, bbox) -> dict:
    nodes, ways = _index(osm)
    area = box(*bbox)
    feats = []
    for w in ways.values():
        t = w.get("tags", {})
        if "golf" in t:
            continue  # golf features live in features.geojson
        pts = _coords(w, nodes)
        closed = len(pts) >= 4 and pts[0] == pts[-1]
        props = {"id": f"osm-way-{w['id']}"}
        if "building" in t and closed:
            geom, props = Polygon(pts), {**props, "kind": "building", "height": building_height(t)}
        elif t.get("amenity") == "parking" and closed:
            geom, props = Polygon(pts), {**props, "kind": "parking"}
        elif t.get("highway") in ROAD_WIDTH_M and len(pts) >= 2:
            geom = LineString(pts)
            props = {**props, "kind": "road", "width": ROAD_WIDTH_M[t["highway"]]}
        else:
            continue
        if not area.intersects(geom):
            continue
        feats.append({"type": "Feature", "properties": props, "geometry": mapping(geom)})
    feats.sort(key=lambda f: f["properties"]["id"])
    return {"type": "FeatureCollection", "features": feats}
