import json

import mercantile
import numpy as np
import rasterio
from PIL import Image
from rasterio.io import MemoryFile
from rasterio.transform import from_bounds

from coursebuilder.imagery import build_tiles

BBOX = (-72.8665, 41.5655, -72.8655, 41.5665)


def synthetic_source():
    w, s, e, n = -72.867, 41.565, -72.865, 41.567
    h, wd = 200, 200
    data = np.zeros((3, h, wd), np.uint8)
    data[1] = 180  # green
    mem = MemoryFile()
    with mem.open(
        driver="GTiff",
        width=wd,
        height=h,
        count=3,
        dtype="uint8",
        crs="EPSG:4326",
        transform=from_bounds(w, s, e, n, wd, h),
    ) as ds:
        ds.write(data)
    return mem


def test_tile_index_covers_bbox(tmp_path):
    mem = synthetic_source()
    with mem.open() as src:
        paths = build_tiles(BBOX, tmp_path, zooms=range(15, 18), sources=[src])
    expected = sorted(f"{t.z}/{t.x}/{t.y}.jpg" for t in mercantile.tiles(*BBOX, zooms=[15, 16, 17]))
    assert sorted(paths) == expected
    assert json.loads((tmp_path / "index.json").read_text()) == sorted(paths)
    img = Image.open(tmp_path / expected[-1])
    assert img.size == (256, 256)
    r, g, _b = img.convert("RGB").getpixel((128, 128))
    assert g > 150 and r < 30


def test_tile_outside_source_is_skipped(tmp_path):
    mem = synthetic_source()
    far = (-72.80, 41.60, -72.799, 41.601)
    with mem.open() as src:
        assert build_tiles(far, tmp_path, zooms=[17], sources=[src]) == []
    assert rasterio  # imported for MemoryFile driver registration
