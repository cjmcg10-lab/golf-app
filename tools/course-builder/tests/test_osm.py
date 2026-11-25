import json
from pathlib import Path

from coursebuilder.manual import apply_manual
from coursebuilder.osm import contacts_from_boundary, normalize_phone, osm_to_features

FIX = json.loads((Path(__file__).parent / "fixtures" / "osm_mini.json").read_text())


def kinds(fc):
    out = {}
    for f in fc["features"]:
        out[f["properties"]["kind"]] = out.get(f["properties"]["kind"], 0) + 1
    return out


def test_feature_kinds_mapped():
    fc = osm_to_features(FIX, 1000)
    assert kinds(fc) == {
        "green": 2,
        "tee": 1,
        "bunker": 1,
        "cartpath": 1,
        "water": 1,
        "trees": 1,
        "clubhouse": 1,
    }
    f = fc["features"][0]["properties"]
    assert f["source"] == "osm" and f["confidence"] == 1.0 and f["id"].startswith("osm-way-")


def test_outside_boundary_dropped():
    ids = {f["properties"]["id"] for f in osm_to_features(FIX, 1000)["features"]}
    assert "osm-way-99" not in ids


def test_features_assigned_to_holes():
    by_id = {f["properties"]["id"]: f["properties"] for f in osm_to_features(FIX, 1000)["features"]}
    assert by_id["osm-way-11"]["hole"] == 1
    assert by_id["osm-way-13"]["hole"] == 1
    assert by_id["osm-way-21"]["hole"] == 2
    assert by_id["osm-way-22"]["hole"] == 2
    assert by_id["osm-way-31"]["hole"] is None  # clubhouse belongs to no hole


def test_normalize_phone():
    assert normalize_phone("+1-860-628-7032") == "+18606287032"
    assert normalize_phone("(860) 628-7032") == "+18606287032"
    assert normalize_phone("628-7032") is None


def test_contacts_from_boundary():
    info = contacts_from_boundary(FIX, 1000)
    assert info["contacts"] == [{"label": "Pro shop", "phone": "+18606287032"}]
    assert info["website"] == "https://example.com/"
    assert info["address"] == "1 Test Rd, Testville, CT 06000"
    assert info["name"] == "Mini CC"


def test_manual_overrides_contacts():
    course = {
        "contacts": [{"label": "Pro shop", "phone": "+18606287032"}],
        "holes": [],
        "website": None,
    }
    manual = {
        "contacts": [
            {"label": "Pro shop", "phone": "+18606287032"},
            {"label": "Restaurant", "phone": "(860) 555-0100"},
        ]
    }
    out = apply_manual(course, manual)
    assert out["contacts"][1] == {"label": "Restaurant", "phone": "+18605550100"}
