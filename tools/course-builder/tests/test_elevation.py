import numpy as np
import pytest
from shapely.geometry import box

from coursebuilder import elevation
from coursebuilder.elevation import HEADER_SIZE, NODATA, green_surface, read_gelv, write_gelv


def test_gelv_roundtrip(tmp_path):
    rng = np.random.default_rng(0)
    grid = rng.uniform(60, 90, size=(7, 5)).astype(np.float32)
    grid[2, 3] = np.nan
    p = tmp_path / "e.bin"
    write_gelv(p, grid, west=-72.87, north=41.57, dlon=1e-5, dlat=1e-5)
    back, meta = read_gelv(p)
    assert p.stat().st_size == HEADER_SIZE + 7 * 5 * 2
    assert np.isnan(back[2, 3])
    assert np.allclose(np.nan_to_num(back), np.nan_to_num(grid), atol=0.001)
    assert meta == {
        "width": 5,
        "height": 7,
        "west": -72.87,
        "north": 41.57,
        "dlon": 1e-5,
        "dlat": 1e-5,
        "base": pytest.approx(float(np.nanmin(grid))),
        "scale": pytest.approx(meta["scale"]),
    }


def test_gelv_scale_precision(tmp_path):
    grid = np.linspace(60, 90, 1000, dtype=np.float32).reshape(20, 50)
    p = tmp_path / "e.bin"
    write_gelv(p, grid, west=0, north=0, dlon=1, dlat=1)
    back, meta = read_gelv(p)
    assert np.max(np.abs(back - grid)) <= 0.001
    assert meta["scale"] <= 0.001
    raw = np.frombuffer(p.read_bytes()[HEADER_SIZE:], dtype="<u2")
    assert raw.max() < NODATA


def test_green_surface_fallback(monkeypatch):
    def boom(*a, **k):
        raise OSError("EPT unreachable")

    def fake_dem(bbox, res_m):
        w, s, e, n = bbox
        h, wd = 30, 40
        return np.full((h, wd), 70.0, np.float32), {
            "west": w,
            "north": n,
            "dlon": (e - w) / wd,
            "dlat": (n - s) / h,
        }

    monkeypatch.setattr(elevation, "ept_ground_points", boom)
    monkeypatch.setattr(elevation, "fetch_dem", fake_dem)
    green = box(-72.8662, 41.5659, -72.8658, 41.5661)  # ~33 m x 22 m
    grid, _meta, source = green_surface(green, res_m=0.5)
    assert source == "dem"
    # green + 5 m buffer each side at 0.5 m → about 86 x 65 cells
    assert abs(grid.shape[1] - 87) <= 2 and abs(grid.shape[0] - 65) <= 2
    assert np.allclose(grid, 70.0)


def test_green_surface_lidar(monkeypatch):
    green = box(-72.8662, 41.5659, -72.8658, 41.5661)
    w, s, e, n = elevation.buffered_bbox(green, 5)
    rng = np.random.default_rng(1)
    k = 20000  # dense: well above 2 pts/m² over ~2,800 m²
    lon = rng.uniform(w, e, k)
    lat = rng.uniform(s, n, k)
    z = 70 + (lon - w) / (e - w)  # 1 m rise west→east
    monkeypatch.setattr(elevation, "ept_ground_points", lambda bbox, dataset=None: (lon, lat, z))
    grid, _meta, source = green_surface(green, res_m=0.5)
    assert source == "lidar"
    assert not np.isnan(grid).any()
    assert grid[:, -1].mean() - grid[:, 0].mean() == pytest.approx(1.0, abs=0.1)
