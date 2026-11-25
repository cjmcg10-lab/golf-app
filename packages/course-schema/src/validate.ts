import type { FeatureCollection } from 'geojson';
import { FEATURE_KINDS, type ValidationIssue } from './types';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isLngLat = (v: unknown) =>
  Array.isArray(v) &&
  v.length === 2 &&
  isNum(v[0]) &&
  isNum(v[1]) &&
  Math.abs(v[0]) <= 180 &&
  Math.abs(v[1]) <= 90;
const E164 = /^\+[1-9]\d{6,14}$/;

export function validateCourse(course: unknown, features: FeatureCollection): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const err = (path: string, message: string) => issues.push({ level: 'error', path, message });
  const warn = (path: string, message: string) => issues.push({ level: 'warning', path, message });

  if (!isObj(course)) {
    err('', 'course must be an object');
    return issues;
  }
  if (course.schemaVersion !== 1) err('schemaVersion', 'must be 1');
  for (const k of ['id', 'version', 'name', 'address'] as const) {
    if (typeof course[k] !== 'string' || course[k] === '') err(k, 'must be a non-empty string');
  }
  if (!isLngLat(course.location)) err('location', 'must be [lng, lat]');

  const featureIds = new Set<string>();
  (features?.features ?? []).forEach((f, i) => {
    const p = (f.properties ?? {}) as Obj;
    if (typeof p.id !== 'string') err(`features[${i}].id`, 'missing id');
    else if (featureIds.has(p.id)) err(`features[${i}].id`, `duplicate id ${p.id}`);
    else featureIds.add(p.id);
    if (!FEATURE_KINDS.includes(p.kind as never))
      err(`features[${i}].kind`, `unknown kind ${String(p.kind)}`);
    if (!['osm', 'ai', 'manual'].includes(p.source as string))
      err(`features[${i}].source`, 'bad source');
    if (!isNum(p.confidence) || p.confidence < 0 || p.confidence > 1)
      err(`features[${i}].confidence`, 'must be 0..1');
  });

  const contacts = Array.isArray(course.contacts) ? course.contacts : [];
  if (!Array.isArray(course.contacts)) err('contacts', 'must be an array');
  contacts.forEach((c: unknown, i) => {
    if (!isObj(c) || typeof c.label !== 'string') err(`contacts[${i}].label`, 'missing label');
    if (!isObj(c) || typeof c.phone !== 'string' || !E164.test(c.phone))
      err(`contacts[${i}].phone`, 'phone must be E.164, e.g. +18606287032');
  });

  const teeIds = new Set(
    (Array.isArray(course.teeSets) ? course.teeSets : []).map((t: unknown) =>
      isObj(t) ? t.id : null,
    ),
  );

  if (!Array.isArray(course.holes) || course.holes.length === 0) {
    err('holes', 'must be a non-empty array');
    return issues;
  }
  let parSum = 0;
  course.holes.forEach((h: unknown, i) => {
    const at = `holes[${i}]`;
    if (!isObj(h)) return err(at, 'must be an object');
    if (h.number !== i + 1) err(`${at}.number`, `expected ${i + 1}`);
    if (!isNum(h.par) || h.par < 3 || h.par > 6) err(`${at}.par`, 'must be 3..6');
    else parSum += h.par;
    if (h.handicap !== null && (!isNum(h.handicap) || h.handicap < 1 || h.handicap > 18))
      err(`${at}.handicap`, 'must be 1..18 or null');
    if (!Array.isArray(h.playLine) || h.playLine.length < 2 || !h.playLine.every(isLngLat))
      err(`${at}.playLine`, 'must have at least 2 [lng, lat] points');
    if (!isLngLat(h.pin)) err(`${at}.pin`, 'missing pin');
    const g = h.green;
    if (!isObj(g) || !isLngLat(g.front) || !isLngLat(g.center) || !isLngLat(g.back))
      err(`${at}.green`, 'needs front/center/back points');
    if (!isNum(h.measuredYards) || h.measuredYards <= 0) err(`${at}.measuredYards`, 'must be > 0');
    if (!Array.isArray(h.featureIds)) err(`${at}.featureIds`, 'must be an array');
    else {
      const unknown = h.featureIds.filter((id) => !featureIds.has(id as string));
      if (unknown.length) err(`${at}.featureIds`, `unknown feature ids: ${unknown.join(', ')}`);
    }
    if (isObj(h.yards)) {
      let longest = 0;
      for (const [tee, y] of Object.entries(h.yards)) {
        if (!teeIds.has(tee)) err(`${at}.yards.${tee}`, 'unknown tee set');
        if (y === null) continue;
        if (!isNum(y) || y <= 0) err(`${at}.yards.${tee}`, 'must be > 0 or null');
        else longest = Math.max(longest, y);
      }
      // measuredYards follows the mapped (usually back) tee, so compare with the longest tee set
      if (
        longest > 0 &&
        isNum(h.measuredYards) &&
        Math.abs(longest - h.measuredYards) / longest > 0.1
      )
        warn(
          `${at}.yards`,
          `longest scorecard ${longest} vs measured ${h.measuredYards} differs > 10%`,
        );
    } else err(`${at}.yards`, 'must be an object');
  });
  if (course.par !== parSum) err('par', `par ${String(course.par)} but holes sum to ${parSum}`);
  if (!Array.isArray(course.attribution) || course.attribution.length === 0)
    err('attribution', 'must list data attributions');
  return issues;
}
