"""Standalone review page: imagery + all features coloured by kind, AI/manual dashed."""

import json

MAPLIBRE = "https://unpkg.com/maplibre-gl@6.17.0/dist"

COLORS = {
    "green": "#3fae49",
    "fairway": "#7fc96b",
    "tee": "#9ad48a",
    "bunker": "#e8d9a8",
    "water": "#3d8fd6",
    "trees": "#2f5d2f",
    "rough": "#5b8f4a",
    "cartpath": "#9a9a9a",
    "ob": "#ffffff",
    "clubhouse": "#c0504d",
}


def render_review(course: dict, features: dict, issues: list[dict]) -> str:
    holes_rows = "".join(
        f"<tr><td>{h['number']}</td><td>{h['par']}</td><td>{h['measuredYards']}</td>"
        f"<td>{h['handicap'] if h['handicap'] is not None else '—'}</td>"
        f"<td>{len(h['featureIds'])}</td></tr>"
        for h in course["holes"]
    )
    issue_rows = (
        "".join(
            f"<tr><td>{i['level']}</td><td>{i['path']}</td><td>{i['message']}</td></tr>"
            for i in issues
        )
        or "<tr><td colspan=3>No validation issues</td></tr>"
    )
    counts: dict[str, int] = {}
    for f in features["features"]:
        s = f["properties"]["source"]
        counts[s] = counts.get(s, 0) + 1
    data = json.dumps({"course": course, "features": features, "colors": COLORS})
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{course["name"]} review</title>
<link rel="stylesheet" href="{MAPLIBRE}/maplibre-gl.css">
<style>
body{{margin:0;font:14px system-ui,sans-serif;display:grid;grid-template-columns:1fr 340px;height:100vh;background:#fff;color:#111}}
#map{{height:100vh}} aside{{overflow:auto;padding:12px}} table{{border-collapse:collapse;width:100%;margin-bottom:16px}}
td,th{{border-bottom:1px solid #ddd;padding:3px 4px;text-align:left}} .k{{display:inline-block;width:10px;height:10px;margin-right:4px}}
@media (max-width:800px){{body{{grid-template-columns:1fr;grid-template-rows:60vh auto}} #map{{height:60vh}}}}
</style></head><body>
<div id="map"></div>
<aside>
<h2>{course["name"]}</h2>
<p>Par {course["par"]} · {len(course["holes"])} holes · features: {counts}</p>
<p>Solid outline = OpenStreetMap. Dashed = AI-proposed or manual. Click a feature for details.</p>
<div id="legend"></div>
<h3>Holes</h3><table><tr><th>#</th><th>Par</th><th>Yds (measured)</th><th>HCP</th><th>Features</th></tr>{holes_rows}</table>
<h3>Validation</h3><table>{issue_rows}</table>
</aside>
<script type="module">
import * as maplibregl from "{MAPLIBRE}/maplibre-gl.mjs";
const D = {data};
const kinds = Object.keys(D.colors);
document.getElementById('legend').innerHTML = kinds.map(k => `<span class="k" style="background:${{D.colors[k]}}"></span>${{k}}`).join(' &nbsp;');
const color = ['match', ['get','kind'], ...kinds.flatMap(k => [k, D.colors[k]]), '#f0f'];
const [w,s,e,n] = D.course.bounds;
const map = new maplibregl.Map({{container:'map', bounds:[[w,s],[e,n]], style:{{version:8,
  sources:{{naip:{{type:'raster',tiles:['tiles/{{z}}/{{x}}/{{y}}.jpg'],tileSize:256,minzoom:15,maxzoom:19,attribution:'NAIP 2023 (USDA) · © OpenStreetMap contributors'}}}},
  layers:[{{id:'bg',type:'background',paint:{{'background-color':'#203020'}}}},{{id:'naip',type:'raster',source:'naip'}}]}}}});
map.on('load', () => {{
  map.addSource('f', {{type:'geojson', data:D.features}});
  const poly = ['==', ['geometry-type'], 'Polygon'];
  const ai = ['!=', ['get','source'], 'osm'];
  map.addLayer({{id:'fill', type:'fill', source:'f', filter:poly, paint:{{'fill-color':color,'fill-opacity':0.25}}}});
  map.addLayer({{id:'line-osm', type:'line', source:'f', filter:['!',ai], paint:{{'line-color':color,'line-width':2}}}});
  map.addLayer({{id:'line-ai', type:'line', source:'f', filter:ai, paint:{{'line-color':color,'line-width':2.5,'line-dasharray':[2,1.5]}}}});
  const pts = {{type:'FeatureCollection', features: D.course.holes.flatMap(h => [
    {{type:'Feature',geometry:{{type:'LineString',coordinates:h.playLine}},properties:{{n:h.number}}}},
    {{type:'Feature',geometry:{{type:'Point',coordinates:h.pin}},properties:{{label:'⛳'+h.number}}}},
    {{type:'Feature',geometry:{{type:'Point',coordinates:h.playLine[0]}},properties:{{label:'T'+h.number}}}}])}};
  map.addSource('h', {{type:'geojson', data:pts}});
  map.addLayer({{id:'play', type:'line', source:'h', filter:['==',['geometry-type'],'LineString'], paint:{{'line-color':'#fff','line-width':1.5,'line-dasharray':[1,2]}}}});
  map.addLayer({{id:'pts', type:'circle', source:'h', filter:['==',['geometry-type'],'Point'], paint:{{'circle-radius':4,'circle-color':'#fff','circle-stroke-color':'#000','circle-stroke-width':1}}}});
  map.on('click', ['fill','line-osm','line-ai'], ev => {{
    const p = ev.features[0].properties;
    new maplibregl.Popup().setLngLat(ev.lngLat).setHTML(`${{p.id}}<br>${{p.kind}} · hole ${{p.hole ?? '—'}}<br>${{p.source}} (${{p.confidence}})`).addTo(map);
  }});
}});
</script></body></html>
"""
