import * as THREE from 'three';

/** Flat surface colours (sRGB). */
export const GROUND = {
  rough: '#86ab68',
  woods: '#5d8a45',
  semiRough: '#76a656',
  fairwayA: '#86c95c',
  fairwayB: '#79bd51',
  tee: '#8fd166',
  collar: '#7cc457',
  green: '#a3e276',
  sand: '#ecdca9',
  sandLip: '#cdb983',
  water: '#4a9bc8',
  waterDeep: '#2f7cae',
  shore: '#2f749f',
  path: '#dcd7ca',
  pathEdge: '#b3ad9f',
  road: '#7f858b',
  roadEdge: '#6a7076',
  parking: '#8f959a',
};

/** The course builder's ground-0..3.png (see tools/course-builder/coursebuilder/ground.py). */
export const GROUND_FILES = [0, 1, 2, 3].map((i) => `ground-${i}.png`);
const CLAMP_M = 8;

/**
 * Terrain material: surfaces come from signed-distance fields, so edges are cut per screen pixel
 * (sharp at any zoom) instead of being stretched texels. Mowing stripes and grain are procedural.
 */
export function groundMaterial(fields: THREE.Texture[], shadow: THREE.Texture): THREE.Material {
  const m = new THREE.MeshLambertMaterial({ color: '#ffffff' });
  const colors = Object.fromEntries(
    Object.entries(GROUND).map(([k, v]) => [`c_${k}`, { value: new THREE.Color(v) }]),
  );
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, colors, {
      g0: { value: fields[0] },
      g1: { value: fields[1] },
      g2: { value: fields[2] },
      g3: { value: fields[3] },
      gShadow: { value: shadow },
    });
    sh.vertexShader = sh.vertexShader
      .replace(
        'void main() {',
        'varying vec2 vGroundUv;\nvarying vec2 vGroundPos;\nvoid main() {\n  vGroundUv = uv;',
      )
      .replace(
        '#include <project_vertex>',
        '#include <project_vertex>\n  vGroundPos = (modelMatrix * vec4(transformed, 1.0)).xz;',
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        'void main() {',
        `uniform sampler2D g0, g1, g2, g3, gShadow;
${Object.keys(GROUND)
  .map((k) => `uniform vec3 c_${k};`)
  .join('\n')}
varying vec2 vGroundUv;
varying vec2 vGroundPos;
float sdm(float v) { return (v - 0.5) * ${(2 * CLAMP_M).toFixed(1)}; }
// 1 where d < edge, anti-aliased over one screen pixel
float cover(float d, float edge) {
  float w = max(fwidth(d), 0.01);
  return clamp((edge - d) / w + 0.5, 0.0, 1.0);
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
// speckle with cells of 1/k metres; fades out once a cell spans many pixels so close-ups stay clean
float speckle(float k) {
  float px = max(fwidth(vGroundPos.x), fwidth(vGroundPos.y)) * k; // cells per pixel
  return (hash(floor(vGroundPos * k)) - 0.5) * smoothstep(0.04, 0.25, px);
}
float bands(float s, float width) {
  float t = abs(fract(s / (2.0 * width)) - 0.5) * 2.0;
  return clamp((t - 0.5) / max(fwidth(t), 0.001) + 0.5, 0.0, 1.0);
}
void main() {`,
      )
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `vec4 diffuseColor = vec4( diffuse, opacity );
  {
    vec3 a = texture2D(g0, vGroundUv).rgb;
    vec3 b = texture2D(g1, vGroundUv).rgb;
    vec3 c = texture2D(g2, vGroundUv).rgb;
    vec3 m = texture2D(g3, vGroundUv).rgb;
    float dFair = sdm(a.r), dGreen = sdm(a.g), dTee = sdm(a.b);
    float dSand = sdm(b.r), dWater = sdm(b.g), dPath = sdm(b.b);
    float dRoad = sdm(c.r), dPark = sdm(c.g), dWoods = sdm(c.b);
    vec2 dir = m.rg * 2.0 - 1.0; // (cos, sin) of the hole bearing
    float along = vGroundPos.x * dir.r + vGroundPos.y * dir.g;
    float hasDir = step(0.5, length(dir));
    vec3 col = c_rough;
    col = mix(col, c_woods, cover(dWoods, 0.0));
    col *= 1.0 + 0.06 * speckle(0.8);
    col = mix(col, c_parking, cover(dPark, 0.0));
    col = mix(col, c_roadEdge, cover(dRoad, 0.5));
    col = mix(col, c_road, cover(dRoad, 0.0));
    col = mix(col, c_semiRough, cover(dFair, 2.5));
    col = mix(col, mix(c_fairwayA, c_fairwayB, bands(along, 7.0) * hasDir), cover(dFair, 0.0));
    col = mix(col, c_semiRough, cover(dTee, 1.2));
    col = mix(col, mix(c_tee, c_fairwayA, bands(along, 2.5) * hasDir), cover(dTee, 0.0));
    col = mix(col, c_collar, cover(dGreen, 1.6));
    col = mix(col, c_green, cover(dGreen, 0.0));
    col = mix(col, c_sandLip, cover(dSand, 0.6));
    col = mix(col, c_sand * (1.0 + 0.05 * speckle(3.0)), cover(dSand, 0.0));
    col = mix(col, c_shore, cover(dWater, 1.0));
    col = mix(col, mix(c_water, c_waterDeep, smoothstep(-1.0, -7.0, dWater)), cover(dWater, 0.0));
    col = mix(col, c_pathEdge, cover(dPath, 0.3));
    col = mix(col, c_path, cover(dPath, 0.0));
    col *= texture2D(gShadow, vGroundUv).r;
    diffuseColor.rgb = col;
  }`,
      );
  };
  return m;
}
