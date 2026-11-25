"""Crisp ground: signed-distance fields of the course surfaces, baked into RGB PNGs.

The app's terrain shader thresholds these, so fairway / green / path edges stay sharp at any
zoom (a plain painted texture blurs). Values are metres to the nearest edge, negative inside,
clamped to ±CLAMP and stored as bytes (128 = on the edge).

    python -m coursebuilder.ground <course-id>
"""

from __future__ import annotations

import json
import math
import struct
import sys
from pathlib import Path

import numpy as np
import shapely
from PIL import Image
from shapely.geometry import LineString, Polygon, shape

CLAMP = 8.0
TEXEL_M = 0.5

# (png, channel) → surface; mowing direction goes in ground-3 as (cos, sin) of the hole bearing
LAYOUT = [
    ["fairway", "green", "tee"],
    ["bunker", "water", "cartpath"],
    ["road", "parking", "trees"],
]
CARTPATH_W = 2.4


def _points(xs: np.ndarray, ys: np.ndarray):
    gx, gy = np.meshgrid(xs, ys)
    return gx.ravel(), gy.ravel()


def _nearest(segments: list[LineString], px: np.ndarray, py: np.ndarray):
    """Distance from each point to the nearest segment (CLAMP if none within CLAMP), and its index."""
    dist = np.full(px.shape, CLAMP)
    idx = np.full(px.shape, -1)
    if not segments:
        return dist, idx
    tree = shapely.STRtree(segments)
    b = np.array([s.bounds for s in segments])
    near = (
        (px >= b[:, 0].min() - CLAMP)
        & (px <= b[:, 2].max() + CLAMP)
        & (py >= b[:, 1].min() - CLAMP)
        & (py <= b[:, 3].max() + CLAMP)
    )
    sel = np.flatnonzero(near)
    pts = shapely.points(px[sel], py[sel])
    (qi, ti), d = tree.query_nearest(
        pts, max_distance=CLAMP, return_distance=True, all_matches=False
    )
    dist[sel[qi]] = np.minimum(d, CLAMP)
    idx[sel[qi]] = ti
    return dist, idx


def _segments(coords) -> list[LineString]:
    c = list(coords)
    return [LineString([c[i], c[i + 1]]) for i in range(len(c) - 1) if c[i] != c[i + 1]]


def signed_distance(polys: list[Polygon], xs: np.ndarray, ys: np.ndarray) -> np.ndarray:
    """Metres to the nearest polygon edge, negative inside; shape (len(ys), len(xs))."""
    px, py = _points(xs, ys)
    segs = [s for p in polys for r in [p.exterior, *p.interiors] for s in _segments(r.coords)]
    d, _ = _nearest(segs, px, py)
    if polys:
        inside = shapely.contains_xy(shapely.union_all(polys), px, py)
        d = np.where(inside, -d, d)
    return d.reshape(len(ys), len(xs))


def line_distance(lines: list[LineString], widths: list[float], xs, ys) -> np.ndarray:
    """Metres to the edge of strips of the given widths along the lines, negative inside."""
    px, py = _points(xs, ys)
    segs, w = [], []
    for line, width in zip(lines, widths):
        s = _segments(line.coords)
        segs += s
        w += [width] * len(s)
    d, i = _nearest(segs, px, py)
    half = np.where(i >= 0, np.array(w + [0.0])[i] / 2, 0.0)
    d = np.where(i >= 0, d - half, CLAMP)
    return np.clip(d, -CLAMP, CLAMP).reshape(len(ys), len(xs))


def encode(d: np.ndarray) -> np.ndarray:
    return np.round((np.clip(d, -CLAMP, CLAMP) / CLAMP * 0.5 + 0.5) * 255).astype(np.uint8)


def _bearing(a, b) -> float:
    return math.atan2(b[0] - a[0], b[1] - a[1])


def build_ground(course_dir: Path) -> list[Path]:
    """Writes ground-0..3.png over the elevation grid's extent (rows north → south)."""
    head = (course_dir / "elevation-course.bin").read_bytes()[:56]
    _, _, _, width, height, west, north, dlon, dlat, _, _ = struct.unpack("<4sHHIIddddff", head)
    south = north - height * dlat
    lat0 = math.radians((north + south) / 2)
    m_lat = 111132.92 - 559.82 * math.cos(2 * lat0) + 1.175 * math.cos(4 * lat0)
    m_lon = 111412.84 * math.cos(lat0) - 93.5 * math.cos(3 * lat0)
    w_m, h_m = width * dlon * m_lon, height * dlat * m_lat

    def local(geom):  # lon/lat → metres east / north of the south-west corner
        return shapely.transform(
            geom, lambda c: np.column_stack([(c[:, 0] - west) * m_lon, (c[:, 1] - south) * m_lat])
        )

    nx, ny = round(w_m / TEXEL_M), round(h_m / TEXEL_M)
    xs = (np.arange(nx) + 0.5) * (w_m / nx)
    ys = h_m - (np.arange(ny) + 0.5) * (h_m / ny)  # north row first

    feats = json.loads((course_dir / "features.geojson").read_text())["features"]
    scen = json.loads((course_dir / "scenery.geojson").read_text())["features"]
    course = json.loads((course_dir / "course.json").read_text())

    def polys(kind, fc):
        out = []
        for f in fc:
            if f["properties"].get("kind") == kind and f["geometry"]["type"] == "Polygon":
                out.append(local(shape(f["geometry"])))
        return out

    fields: dict[str, np.ndarray] = {}
    for kind in ["fairway", "green", "tee", "bunker", "water", "trees"]:
        fields[kind] = signed_distance(polys(kind, feats), xs, ys)
    fields["parking"] = signed_distance(polys("parking", scen), xs, ys)
    paths = [
        local(shape(f["geometry"]))
        for f in feats
        if f["properties"].get("kind") == "cartpath" and f["geometry"]["type"] == "LineString"
    ]
    fields["cartpath"] = line_distance(paths, [CARTPATH_W] * len(paths), xs, ys)
    roads = [
        f
        for f in scen
        if f["properties"].get("kind") == "road" and f["geometry"]["type"] == "LineString"
    ]
    fields["road"] = line_distance(
        [local(shape(f["geometry"])) for f in roads],
        [float(f["properties"].get("width", 5)) for f in roads],
        xs,
        ys,
    )

    # mowing direction: each fairway / tee takes its hole's tee → green bearing
    bearing = {h["number"]: _bearing(h["playLine"][0], h["playLine"][-1]) for h in course["holes"]}
    cos = np.zeros((ny, nx))
    sin = np.zeros((ny, nx))
    px, py = _points(xs, ys)
    for f in feats:
        k = f["properties"].get("kind")
        hole = f["properties"].get("hole")
        if k not in ("fairway", "tee") or hole not in bearing or f["geometry"]["type"] != "Polygon":
            continue
        g = local(shape(f["geometry"])).buffer(3)
        x0, y0, x1, y1 = g.bounds
        sel = np.flatnonzero((px >= x0) & (px <= x1) & (py >= y0) & (py <= y1))
        inside = sel[shapely.contains_xy(g, px[sel], py[sel])]
        cos.ravel()[inside] = math.cos(bearing[hole])
        sin.ravel()[inside] = math.sin(bearing[hole])

    out = []
    for i, names in enumerate(LAYOUT):
        rgb = np.dstack([encode(fields[n]) for n in names])
        out.append(course_dir / f"ground-{i}.png")
        Image.fromarray(rgb, "RGB").save(out[-1], optimize=True)
    dirs = np.dstack(
        [
            np.round((cos * 0.5 + 0.5) * 255).astype(np.uint8),
            np.round((sin * 0.5 + 0.5) * 255).astype(np.uint8),
            np.zeros((ny, nx), np.uint8),
        ]
    )
    out.append(course_dir / "ground-3.png")
    Image.fromarray(dirs, "RGB").save(out[-1], optimize=True)
    return out


def main() -> None:
    d = Path(__file__).resolve().parents[3] / "courses" / sys.argv[1]
    for p in build_ground(d):
        print(p.name, p.stat().st_size // 1024, "KB")


if __name__ == "__main__":
    main()
