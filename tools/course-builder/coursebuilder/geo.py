"""Shared geometry helpers: local metric projection and geodesic lengths."""

from functools import lru_cache

import shapely
from pyproj import Geod, Transformer
from shapely.geometry.base import BaseGeometry

GEOD = Geod(ellps="WGS84")
YARD_M = 0.9144


@lru_cache(maxsize=8)
def _transformers(lon0: float, lat0: float):
    proj = f"+proj=aeqd +lat_0={lat0} +lon_0={lon0} +datum=WGS84 +units=m"
    fwd = Transformer.from_crs("EPSG:4326", proj, always_xy=True)
    inv = Transformer.from_crs(proj, "EPSG:4326", always_xy=True)
    return fwd, inv


class Local:
    """Azimuthal-equidistant projection centred on a point: metres, accurate over a course."""

    def __init__(self, lon0: float, lat0: float):
        self.fwd, self.inv = _transformers(round(lon0, 4), round(lat0, 4))

    def to_m(self, g: BaseGeometry) -> BaseGeometry:
        return shapely.transform(g, self.fwd.transform, interleaved=False)

    def to_ll(self, g: BaseGeometry) -> BaseGeometry:
        return shapely.transform(g, self.inv.transform, interleaved=False)


def geodesic_m(points) -> float:
    lons = [p[0] for p in points]
    lats = [p[1] for p in points]
    return GEOD.line_length(lons, lats)


def geodesic_yards(points) -> float:
    return geodesic_m(points) / YARD_M
