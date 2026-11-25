from shapely.geometry import box, mapping

from coursebuilder.merge import merge_features


def feat(fid, kind, geom, source, conf=1.0, hole=1):
    return {
        "type": "Feature",
        "geometry": mapping(geom),
        "properties": {"id": fid, "kind": kind, "hole": hole, "source": source, "confidence": conf},
    }


def fc(*fs):
    return {"type": "FeatureCollection", "features": list(fs)}


OSM_BUNKER = feat("osm-way-1", "bunker", box(0, 0, 10, 10), "osm")


def ids(out):
    return [f["properties"]["id"] for f in out["features"]]


def test_ai_duplicate_of_osm_dropped():
    ai = feat("ai-1", "bunker", box(1, 1, 10, 10), "ai", 0.7)  # IoU 0.81
    assert ids(merge_features(fc(OSM_BUNKER), fc(ai), None)) == ["osm-way-1"]


def test_ai_new_feature_kept():
    ai_trees = feat("ai-2", "trees", box(1, 1, 10, 10), "ai", 0.6)  # different kind
    ai_far = feat("ai-3", "bunker", box(50, 50, 60, 60), "ai", 0.6)
    assert ids(merge_features(fc(OSM_BUNKER), fc(ai_trees, ai_far), None)) == [
        "osm-way-1",
        "ai-2",
        "ai-3",
    ]


def test_manual_wins():
    manual = feat("manual-1", "bunker", box(0, 0, 9, 10), "manual")  # replaces the OSM bunker
    out = merge_features(fc(OSM_BUNKER), fc(), fc(manual))
    assert ids(out) == ["manual-1"]


def test_manual_remove():
    # a manual feature with kind "remove" deletes overlapping features of any source
    rm = {
        "type": "Feature",
        "geometry": mapping(box(0, 0, 10, 10)),
        "properties": {"id": "manual-rm", "remove": True},
    }
    assert ids(merge_features(fc(OSM_BUNKER), fc(), fc(rm))) == []
