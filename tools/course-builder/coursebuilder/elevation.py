"""Elevation: USGS 3DEP 1 m DEM for the course, LiDAR ground points for greens, GELV file format.

GELV v1 (little-endian): magic "GELV" | version u16 | reserved u16 | width u32 | height u32 |
west f64 | north f64 | dLon f64 | dLat f64 | base f32 | scale f32  (56 bytes), then
width*height u16 row-major from the north-west corner; 65535 = nodata; metres = base + v*scale.
"""

import io
import json
import math
import struct
import warnings
from pathlib import Path

import numpy as np
import requests
from pyproj import Transformer
from shapely.geometry.base import BaseGeometry

HEADER = struct.Struct("<4sHHIIddddff")
HEADER_SIZE = HEADER.size
NODATA = 65535
M_PER_DEG_LAT = 111_320.0

DEM_URL = (
    "https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage"
)
EPT_ROOT = "https://s3-us-west-2.amazonaws.com/usgs-lidar-public"
DEFAULT_EPT = "CT_Statewide_B3_2016"
MIN_GROUND_DENSITY = 2.0  # points per m²
CACHE_DIR: Path | None = None
_session = requests.Session()


# ---------- GELV ----------
def write_gelv(path, grid: np.ndarray, west, north, dlon, dlat) -> None:
    g = np.asarray(grid, dtype=np.float64)
    valid = ~np.isnan(g)
    base = float(np.nanmin(g)) if valid.any() else 0.0
    rng = float(np.nanmax(g)) - base if valid.any() else 0.0
    scale = max(rng / (NODATA - 1), 1e-6)
    # store base as float32 and quantise against that exact value
    base = float(np.float32(base))
    scale = float(np.float32(scale))
    q = np.full(g.shape, NODATA, dtype="<u2")
    q[valid] = np.clip(np.round((g[valid] - base) / scale), 0, NODATA - 1).astype("<u2")
    h, w = g.shape
    Path(path).write_bytes(
        HEADER.pack(b"GELV", 1, 0, w, h, west, north, dlon, dlat, base, scale) + q.tobytes()
    )


def read_gelv(path) -> tuple[np.ndarray, dict]:
    raw = Path(path).read_bytes()
    magic, ver, _, w, h, west, north, dlon, dlat, base, scale = HEADER.unpack_from(raw)
    if magic != b"GELV" or ver != 1:
        raise ValueError(f"{path}: not a GELV v1 file")
    q = np.frombuffer(raw, dtype="<u2", offset=HEADER_SIZE, count=w * h).reshape(h, w)
    grid = base + q.astype(np.float64) * scale
    grid[q == NODATA] = np.nan
    meta = {
        "width": w,
        "height": h,
        "west": west,
        "north": north,
        "dlon": dlon,
        "dlat": dlat,
        "base": base,
        "scale": scale,
    }
    return grid, meta


# ---------- helpers ----------
def deg_per_m(lat: float) -> tuple[float, float]:
    return 1 / (M_PER_DEG_LAT * math.cos(math.radians(lat))), 1 / M_PER_DEG_LAT


def buffered_bbox(geom: BaseGeometry, buffer_m: float):
    w, s, e, n = geom.bounds
    dlon, dlat = deg_per_m((s + n) / 2)
    return (w - buffer_m * dlon, s - buffer_m * dlat, e + buffer_m * dlon, n + buffer_m * dlat)


def grid_for_bbox(bbox, res_m):
    w, s, e, n = bbox
    dlon1, dlat1 = deg_per_m((s + n) / 2)
    nx = max(1, round((e - w) / (dlon1 * res_m)))
    ny = max(1, round((n - s) / (dlat1 * res_m)))
    return nx, ny, {"west": w, "north": n, "dlon": (e - w) / nx, "dlat": (n - s) / ny}


# ---------- DEM ----------
def fetch_dem(bbox, res_m: float = 1.0) -> tuple[np.ndarray, dict]:
    import rasterio

    nx, ny, meta = grid_for_bbox(bbox, res_m)
    w, s, e, n = bbox
    r = _session.get(
        DEM_URL,
        params={
            "bbox": f"{w},{s},{e},{n}",
            "bboxSR": 4326,
            "imageSR": 4326,
            "size": f"{nx},{ny}",
            "format": "tiff",
            "pixelType": "F32",
            "interpolation": "RSP_BilinearInterpolation",
            "noData": -9999,
            "f": "image",
        },
        timeout=180,
    )
    r.raise_for_status()
    with rasterio.MemoryFile(r.content) as mem, mem.open() as ds:
        grid = ds.read(1).astype(np.float32)
    grid[grid <= -9000] = np.nan
    return grid, meta


def resample(src: np.ndarray, src_meta: dict, nx: int, ny: int, meta: dict) -> np.ndarray:
    """Bilinear resample of a lon/lat grid onto another (cell centres)."""
    lon = meta["west"] + (np.arange(nx) + 0.5) * meta["dlon"]
    lat = meta["north"] - (np.arange(ny) + 0.5) * meta["dlat"]
    fx = (lon - src_meta["west"]) / src_meta["dlon"] - 0.5
    fy = (src_meta["north"] - lat) / src_meta["dlat"] - 0.5
    h, w = src.shape
    fx = np.clip(fx, 0, w - 1)
    fy = np.clip(fy, 0, h - 1)
    x0 = np.floor(fx).astype(int)
    y0 = np.floor(fy).astype(int)
    x1 = np.minimum(x0 + 1, w - 1)
    y1 = np.minimum(y0 + 1, h - 1)
    tx = (fx - x0)[None, :]
    ty = (fy - y0)[:, None]
    a = src[np.ix_(y0, x0)]
    b = src[np.ix_(y0, x1)]
    c = src[np.ix_(y1, x0)]
    d = src[np.ix_(y1, x1)]
    return ((a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty).astype(np.float32)


# ---------- LiDAR (Entwine Point Tiles) ----------
def _get(url: str) -> bytes:
    if CACHE_DIR:
        p = CACHE_DIR / "ept" / url.replace(EPT_ROOT + "/", "").replace("/", "_")
        if p.exists():
            return p.read_bytes()
    r = _session.get(url, timeout=180)
    r.raise_for_status()
    if CACHE_DIR:
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(r.content)
    return r.content


def ept_ground_points(bbox, dataset: str = DEFAULT_EPT):
    """Ground-classified (class 2) points inside bbox (lon/lat). Returns (lon, lat, z) arrays."""
    import laspy

    base = f"{EPT_ROOT}/{dataset}"
    info = json.loads(_get(f"{base}/ept.json"))
    to3857 = Transformer.from_crs("EPSG:4326", "EPSG:3857", always_xy=True)
    to4326 = Transformer.from_crs("EPSG:3857", "EPSG:4326", always_xy=True)
    (qx0, qx1), (qy0, qy1) = to3857.transform([bbox[0], bbox[2]], [bbox[1], bbox[3]])
    cube = info["bounds"]
    hier: dict[str, int] = {}

    def load_hier(key):
        hier.update(json.loads(_get(f"{base}/ept-hierarchy/{key}.json")))

    load_hier("0-0-0-0")
    xs, ys, zs = [], [], []
    stack = [(0, 0, 0, 0)]
    while stack:
        d, x, y, z = stack.pop()
        key = f"{d}-{x}-{y}-{z}"
        if key not in hier:
            continue
        size = (cube[3] - cube[0]) / 2**d
        nx0 = cube[0] + x * size
        ny0 = cube[1] + y * size
        if nx0 > qx1 or nx0 + size < qx0 or ny0 > qy1 or ny0 + size < qy0:
            continue
        if hier[key] == -1:
            load_hier(key)
        if hier.get(key, 0) > 0:
            las = laspy.read(io.BytesIO(_get(f"{base}/ept-data/{key}.laz")))
            px, py, pz = np.asarray(las.x), np.asarray(las.y), np.asarray(las.z)
            m = (
                (np.asarray(las.classification) == 2)
                & (px >= qx0)
                & (px <= qx1)
                & (py >= qy0)
                & (py <= qy1)
            )
            xs.append(px[m])
            ys.append(py[m])
            zs.append(pz[m])
        for dx in (0, 1):
            for dy in (0, 1):
                for dz in (0, 1):
                    stack.append((d + 1, 2 * x + dx, 2 * y + dy, 2 * z + dz))
    if not xs:
        return np.array([]), np.array([]), np.array([])
    lon, lat = to4326.transform(np.concatenate(xs), np.concatenate(ys))
    return np.asarray(lon), np.asarray(lat), np.concatenate(zs)


def _fill_nearest(grid: np.ndarray, max_iter: int = 50) -> np.ndarray:
    g = grid.copy()
    for _ in range(max_iter):
        holes = np.isnan(g)
        if not holes.any():
            break
        p = np.pad(g, 1, constant_values=np.nan)
        neigh = np.stack([p[:-2, 1:-1], p[2:, 1:-1], p[1:-1, :-2], p[1:-1, 2:]])
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", RuntimeWarning)
            fill = np.nanmean(neigh, axis=0)
        g[holes] = fill[holes]
    return g


def green_surface(green: BaseGeometry, res_m: float = 0.5, dataset: str = DEFAULT_EPT):
    """High-res surface for one green (+5 m). Returns (grid, meta, 'lidar'|'dem')."""
    bbox = buffered_bbox(green, 5)
    nx, ny, meta = grid_for_bbox(bbox, res_m)
    try:
        lon, lat, z = ept_ground_points(bbox, dataset=dataset)
    except Exception:  # noqa: BLE001 - any EPT failure falls back to the DEM
        lon = np.array([])
    area = nx * ny * res_m * res_m
    if len(lon) / area >= MIN_GROUND_DENSITY:
        ix = np.clip(((lon - meta["west"]) / meta["dlon"]).astype(int), 0, nx - 1)
        iy = np.clip(((meta["north"] - lat) / meta["dlat"]).astype(int), 0, ny - 1)
        sums = np.zeros((ny, nx))
        counts = np.zeros((ny, nx))
        np.add.at(sums, (iy, ix), z)
        np.add.at(counts, (iy, ix), 1)
        with np.errstate(invalid="ignore", divide="ignore"):
            grid = np.where(counts > 0, sums / counts, np.nan)
        return _fill_nearest(grid).astype(np.float32), meta, "lidar"
    dem, dem_meta = fetch_dem(buffered_bbox(green, 8), 1.0)
    return resample(dem, dem_meta, nx, ny, meta), meta, "dem"
