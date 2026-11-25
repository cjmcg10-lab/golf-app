import numpy as np
from shapely.geometry import LineString, Polygon

from coursebuilder.ground import CLAMP, encode, line_distance, signed_distance


def _grid(n=41, step=0.5):
    xs = np.arange(n) * step - 10  # -10 .. 10 m
    return xs, xs.copy()


def test_signed_distance_inside_negative_outside_positive():
    xs, ys = _grid()
    sq = Polygon([(-5, -5), (5, -5), (5, 5), (-5, 5)])
    d = signed_distance([sq], xs, ys)
    centre = d[20, 20]  # (0, 0)
    assert centre == -5.0
    assert abs(d[20, 36] - 3.0) < 1e-6  # x = 8 m, 3 m outside the east edge
    assert d[0, 0] > 0


def test_signed_distance_clamps_far_away():
    xs = np.array([100.0])
    ys = np.array([0.0])
    sq = Polygon([(-5, -5), (5, -5), (5, 5), (-5, 5)])
    assert signed_distance([sq], xs, ys)[0, 0] == CLAMP


def test_line_distance_is_to_the_edge_of_the_strip():
    xs, ys = _grid()
    d = line_distance([LineString([(-10, 0), (10, 0)])], [4.0], xs, ys)
    assert abs(d[30, 20] - 3.0) < 1e-6  # y = 5 m from a 4 m wide strip → 3 m outside
    assert d[20, 20] == -2.0  # on the centre line, 2 m inside


def test_encode_maps_clamp_range_to_bytes():
    e = encode(np.array([-CLAMP, 0.0, CLAMP]))
    assert e.dtype == np.uint8
    assert list(e) == [0, 128, 255]
