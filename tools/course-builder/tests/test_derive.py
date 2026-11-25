import json
from pathlib import Path

from coursebuilder.derive import derive_holes, geodesic_yards
from coursebuilder.manual import apply_manual
from coursebuilder.osm import osm_to_features

FIX = json.loads((Path(__file__).parent / "fixtures" / "osm_mini.json").read_text())


def holes():
    return derive_holes(FIX, osm_to_features(FIX, 1000))


def test_hole_from_way():
    h1, h2 = holes()
    assert (h1["number"], h1["par"], h1["handicap"]) == (1, 4, None)
    assert h2["par"] == 3
    assert h1["playLine"][0] == [-72.869, 41.566]


def test_pin_nearest_green():
    h1, h2 = holes()
    assert h1["pin"] == [-72.86595, 41.56602]
    assert h2["pin"] == [-72.8635, 41.5678]


def test_green_front_center_back_ordering():
    for h in holes():
        tee = h["playLine"][0]
        g = h["green"]
        assert geodesic_yards([tee, g["front"]]) < geodesic_yards([tee, g["center"]])
        assert geodesic_yards([tee, g["center"]]) < geodesic_yards([tee, g["back"]])
        assert h["playLine"][-1] == g["center"]


def test_green_depth_matches_polygon():
    # hole 1 green spans lon ±0.0002 → ~33.4 m ≈ 36.5 yds front-to-back along an east-west line
    g = holes()[0]["green"]
    assert abs(geodesic_yards([g["front"], g["back"]]) - 36.5) < 1.5


def test_measured_yards():
    # 0.0012 deg lat ≈ 133.4 m ≈ 145.9 yds
    assert abs(geodesic_yards([[-72.8635, 41.5665], [-72.8635, 41.5677]]) - 145.9) < 1
    assert holes()[1]["measuredYards"] == round(geodesic_yards(holes()[1]["playLine"]))


def test_feature_ids_per_hole():
    h1 = holes()[0]
    assert set(h1["featureIds"]) == {"osm-way-11", "osm-way-12", "osm-way-13", "osm-way-14"}


def test_manual_hole_data():
    course = {"contacts": [], "holes": holes(), "website": None}
    out = apply_manual(course, {"holes": {1: {"handicap": 7, "yards": {"white": 300}}}})
    assert out["holes"][0]["handicap"] == 7
    assert out["holes"][0]["yards"] == {"white": 300}
