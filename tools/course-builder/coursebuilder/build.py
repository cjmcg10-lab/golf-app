"""Build a course package: python -m coursebuilder.build <course-id> [--skip-tiles] [--skip-elevation]"""

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

import yaml
from shapely.geometry import shape

from . import elevation
from .derive import derive_holes
from .elevation import deg_per_m, fetch_dem, green_surface, write_gelv
from .imagery import build_tiles
from .manual import apply_manual, load_manual
from .merge import merge_features
from .osm import boundary_polygon, contacts_from_boundary, fetch_osm, osm_to_features
from .review import render_review
from .scenery import osm_to_scenery

REPO = Path(__file__).resolve().parents[3]


def _round(obj, nd=7):
    if isinstance(obj, float):
        return round(obj, nd)
    if isinstance(obj, list):
        return [_round(x, nd) for x in obj]
    if isinstance(obj, tuple):
        return [_round(x, nd) for x in obj]
    if isinstance(obj, dict):
        return {k: _round(v, nd) for k, v in obj.items()}
    return obj


def _load_fc(p: Path):
    return json.loads(p.read_text()) if p.exists() else None


def build(course_id: str, skip_tiles=False, skip_elevation=False) -> int:
    d = REPO / "courses" / course_id
    cfg = yaml.safe_load((d / "build.yaml").read_text())
    cache = d / ".cache"
    elevation.CACHE_DIR = cache

    # the boundary way alone tells us the bbox; fetch a padded area around it
    seed = fetch_osm(tuple(cfg["seed_bbox"]), cache / "osm.json")
    b = boundary_polygon(seed, cfg["osm_boundary_way"])
    dlon, dlat = deg_per_m(b.centroid.y)
    pad = cfg.get("pad_m", 50)
    w, s, e, n = b.bounds
    bbox = (w - pad * dlon, s - pad * dlat, e + pad * dlon, n + pad * dlat)
    osm = seed

    osm_fc = osm_to_features(osm, cfg["osm_boundary_way"])
    features = merge_features(osm_fc, _load_fc(d / "ai.geojson"), _load_fc(d / "manual.geojson"))
    holes = derive_holes(osm, features)
    info = contacts_from_boundary(osm, cfg["osm_boundary_way"])
    course = {
        "schemaVersion": 1,
        "id": course_id,
        "version": str(cfg["version"]),
        "name": cfg.get("name") or info["name"],
        "address": info["address"],
        "location": [round(b.centroid.x, 6), round(b.centroid.y, 6)],
        "bounds": [round(v, 6) for v in bbox],
        "par": info["par"] if info["par"] else sum(h["par"] or 0 for h in holes),
        "website": info["website"],
        "contacts": info["contacts"],
        "teeSets": [],
        "holes": holes,
        "imagery": None,
        "elevation": None,
        "attribution": [
            "© OpenStreetMap contributors (ODbL)",
            "Imagery: USDA NAIP 2023 (public domain)",
            "Elevation: USGS 3DEP (public domain)",
        ],
    }
    course = apply_manual(course, load_manual(d / "manual.yaml"))

    if not skip_elevation:
        dem, meta = fetch_dem(bbox, 1.0)
        write_gelv(
            d / "elevation-course.bin", dem, meta["west"], meta["north"], meta["dlon"], meta["dlat"]
        )
        (d / "greens").mkdir(exist_ok=True)
        greens, sources = {}, set()
        for h in holes:
            gs = [
                f
                for f in features["features"]
                if f["properties"]["kind"] == "green" and f["properties"]["hole"] == h["number"]
            ]
            if not gs:
                continue
            geom = shape(gs[0]["geometry"])
            grid, gm, src = green_surface(geom, 0.5, cfg.get("lidar_ept", elevation.DEFAULT_EPT))
            write_gelv(
                d / "greens" / f"{h['number']}.bin",
                grid,
                gm["west"],
                gm["north"],
                gm["dlon"],
                gm["dlat"],
            )
            greens[str(h["number"])] = f"/courses/{course_id}/greens/{h['number']}.bin"
            sources.add(src)
            print(f"green {h['number']}: {src} {grid.shape}", flush=True)
        course["elevation"] = {
            "course": f"/courses/{course_id}/elevation-course.bin",
            "greens": greens,
            "greenSource": "lidar" if sources == {"lidar"} else "dem",
        }
    elif (d / "course.json").exists():
        course["elevation"] = json.loads((d / "course.json").read_text()).get("elevation")

    tiles_dir = d / "tiles"
    if not skip_tiles:
        if tiles_dir.exists():
            shutil.rmtree(tiles_dir)
        paths = build_tiles(bbox, tiles_dir, zooms=range(15, 20))
        print(f"tiles: {len(paths)}", flush=True)
    if (tiles_dir / "index.json").exists():
        course["imagery"] = {
            "tiles": f"/courses/{course_id}/tiles/{{z}}/{{x}}/{{y}}.jpg",
            "minzoom": 15,
            "maxzoom": 19,
            "attribution": "Imagery: USDA NAIP 2023",
        }

    (d / "course.json").write_text(json.dumps(_round(course), indent=1))
    (d / "features.geojson").write_text(json.dumps(_round(features)))
    (d / "scenery.geojson").write_text(json.dumps(_round(osm_to_scenery(osm, bbox))))

    res = subprocess.run(
        ["pnpm", "-s", "--filter", "@golf/course-schema", "validate", str(d)],
        check=False,
        cwd=REPO,
        capture_output=True,
        text=True,
    )
    print(res.stdout.strip())
    issues = []
    for line in res.stdout.splitlines():
        if line.startswith(("ERROR ", "WARNING ")):
            level, rest = line.split(" ", 1)
            path, _, msg = rest.partition(": ")
            issues.append({"level": level.lower(), "path": path, "message": msg})
    (d / "review.html").write_text(render_review(_round(course), features, issues))
    return res.returncode


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("course_id")
    ap.add_argument("--skip-tiles", action="store_true")
    ap.add_argument("--skip-elevation", action="store_true")
    a = ap.parse_args()
    sys.exit(build(a.course_id, a.skip_tiles, a.skip_elevation))


if __name__ == "__main__":
    main()
