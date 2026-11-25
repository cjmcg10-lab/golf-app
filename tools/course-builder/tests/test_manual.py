from coursebuilder.manual import apply_manual


def test_manual_tee_replaces_play_line_start():
    course = {
        "holes": [
            {"number": 12, "playLine": [[0.0, 0.0], [0.0, 0.001]], "measuredYards": 122},
        ]
    }
    out = apply_manual(course, {"holes": {12: {"tee": [0.0, -0.0002]}}})
    h = out["holes"][0]
    assert h["playLine"] == [[0.0, -0.0002], [0.0, 0.001]]
    assert h["measuredYards"] == 145  # 0.0012° of latitude at the equator ≈ 132.7 m (WGS84)
