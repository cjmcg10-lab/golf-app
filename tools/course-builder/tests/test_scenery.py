from coursebuilder.scenery import building_height, osm_to_scenery


def _osm():
    nodes = [
        (1, 0.0, 0.0), (2, 0.0001, 0.0), (3, 0.0001, 0.0001), (4, 0.0, 0.0001),
        (5, 0.0, 0.0), (6, 0.0005, 0.0),
        (7, 1.0, 1.0), (8, 1.0001, 1.0), (9, 1.0001, 1.0001),
    ]
    els = [{"type": "node", "id": i, "lon": x, "lat": y} for i, x, y in nodes]
    els += [
        {"type": "way", "id": 10, "nodes": [1, 2, 3, 4, 1], "tags": {"building": "yes", "building:levels": "2"}},
        {"type": "way", "id": 11, "nodes": [5, 6], "tags": {"highway": "residential", "name": "Elm St"}},
        {"type": "way", "id": 12, "nodes": [1, 2, 3, 1], "tags": {"amenity": "parking"}},
        {"type": "way", "id": 13, "nodes": [7, 8, 9, 7], "tags": {"building": "yes"}},  # outside bbox
        {"type": "way", "id": 14, "nodes": [5, 6], "tags": {"golf": "cartpath", "highway": "service"}},
    ]
    return {"elements": els}


def test_scenery_kinds_inside_bbox():
    fc = osm_to_scenery(_osm(), (-0.001, -0.001, 0.001, 0.001))
    got = {f["properties"]["id"]: f for f in fc["features"]}
    assert set(got) == {"osm-way-10", "osm-way-11", "osm-way-12"}
    assert got["osm-way-10"]["properties"] == {"id": "osm-way-10", "kind": "building", "height": 7.0}
    assert got["osm-way-11"]["properties"]["kind"] == "road"
    assert got["osm-way-11"]["properties"]["width"] == 6.0
    assert got["osm-way-11"]["geometry"]["type"] == "LineString"
    assert got["osm-way-12"]["properties"]["kind"] == "parking"


def test_building_height_from_tags():
    assert building_height({"height": "12 m"}) == 12.0
    assert building_height({"building:levels": "3"}) == 10.0
    assert building_height({"building": "church"}) == 14.0
    assert building_height({"building": "yes"}) == 6.0
