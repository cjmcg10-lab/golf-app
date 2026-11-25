"""NAIP aerial imagery → XYZ JPEG tiles (EPSG:3857, 256 px) for the course."""

import json
import os
from pathlib import Path

import mercantile
import numpy as np
import requests
from PIL import Image
from rasterio.enums import Resampling
from rasterio.transform import from_bounds as transform_from_bounds
from rasterio.warp import reproject, transform_bounds
from rasterio.windows import from_bounds as window_from_bounds

STAC = "https://planetarycomputer.microsoft.com/api/stac/v1/search"
SIGN = "https://planetarycomputer.microsoft.com/api/sas/v1/sign"
TILE = 256


def naip_hrefs(bbox) -> list[str]:
    """Signed COG URLs for the newest NAIP year covering bbox."""
    w, s, e, n = bbox
    r = requests.post(
        STAC,
        json={
            "collections": ["naip"],
            "bbox": [w, s, e, n],
            "limit": 20,
            "sortby": [{"field": "datetime", "direction": "desc"}],
        },
        timeout=60,
    )
    r.raise_for_status()
    items = r.json()["features"]
    if not items:
        raise RuntimeError("no NAIP imagery for bbox")
    year = items[0]["properties"]["datetime"][:4]
    hrefs = []
    for it in items:
        if it["properties"]["datetime"][:4] == year:
            href = it["assets"]["image"]["href"]
            sr = requests.get(SIGN, params={"href": href}, timeout=60)
            sr.raise_for_status()
            hrefs.append(sr.json()["href"])
    return hrefs


def open_naip(bbox):
    import rasterio

    os.environ.setdefault("CURL_CA_BUNDLE", "/root/.ccr/ca-bundle.crt")
    os.environ.setdefault("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")
    return [rasterio.open(h) for h in naip_hrefs(bbox)]


def _render_tile(t, sources) -> np.ndarray | None:
    b = mercantile.xy_bounds(t)
    dst_t = transform_from_bounds(b.left, b.bottom, b.right, b.top, TILE, TILE)
    out = np.zeros((3, TILE, TILE), np.uint8)
    covered = np.zeros((TILE, TILE), bool)
    for src in sources:
        sb = transform_bounds("EPSG:3857", src.crs, b.left, b.bottom, b.right, b.top)
        win = window_from_bounds(*sb, transform=src.transform)
        win = (
            win.intersection(window_from_bounds(*src.bounds, transform=src.transform))
            if _overlaps(sb, src.bounds)
            else None
        )
        if win is None or win.width < 1 or win.height < 1:
            continue
        # read at roughly 2x the tile's resolution (uses COG overviews)
        oh = max(1, min(int(win.height), TILE * 2))
        ow = max(1, min(int(win.width), TILE * 2))
        data = src.read(
            [1, 2, 3], window=win, out_shape=(3, oh, ow), resampling=Resampling.bilinear
        )
        wb = src.window_bounds(win)
        st = transform_from_bounds(*wb, ow, oh)
        part = np.zeros((3, TILE, TILE), np.uint8)
        mask = np.zeros((TILE, TILE), np.uint8)
        reproject(
            data,
            part,
            src_transform=st,
            src_crs=src.crs,
            dst_transform=dst_t,
            dst_crs="EPSG:3857",
            resampling=Resampling.bilinear,
        )
        reproject(
            np.ones((oh, ow), np.uint8),
            mask,
            src_transform=st,
            src_crs=src.crs,
            dst_transform=dst_t,
            dst_crs="EPSG:3857",
            resampling=Resampling.nearest,
        )
        m = mask.astype(bool) & ~covered
        out[:, m] = part[:, m]
        covered |= m
    return out if covered.any() else None


def _overlaps(a, b) -> bool:
    return not (a[2] <= b[0] or a[0] >= b[2] or a[3] <= b[1] or a[1] >= b[3])


def build_tiles(bbox, out_dir: Path, zooms=range(15, 20), sources=None) -> list[str]:
    out_dir = Path(out_dir)
    if sources is None:
        sources = open_naip(bbox)
    paths = []
    for t in mercantile.tiles(*bbox, zooms=list(zooms)):
        img = _render_tile(t, sources)
        if img is None:
            continue
        rel = f"{t.z}/{t.x}/{t.y}.jpg"
        p = out_dir / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        Image.fromarray(np.moveaxis(img, 0, -1)).save(p, quality=80)
        paths.append(rel)
    paths.sort()
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "index.json").write_text(json.dumps(paths))
    return paths
