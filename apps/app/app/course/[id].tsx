import type { Course, LngLat } from '@golf/course-schema';
import { distanceYards } from '@golf/geo';
import type { FeatureCollection } from 'geojson';
import { Link, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { CourseGate } from '../../src/course/CourseGate';
import { CourseProvider } from '../../src/course/CourseProvider';
import { computeDistances, OFF_COURSE_YARDS } from '../../src/distances/distances';
import { HazardList } from '../../src/hole/HazardList';
import { HoleHeader } from '../../src/hole/HoleHeader';
import { HoleNav } from '../../src/hole/HoleNav';
import { useLocation } from '../../src/location/useLocation';
import { shotStats } from '../../src/round/shotStats';
import { CourseScene } from '../../src/scene/CourseScene';
import type { CourseSceneHandle } from '../../src/scene/types';
import { clearTee, setTee, teeFor } from '../../src/settings/store';
import { useSettings } from '../../src/settings/useSettings';
import { colors, fonts } from '../../src/theme';
import {
  compass,
  FloatButton,
  Glass,
  MintButton,
  Rise,
  Segmented,
  WeatherPill,
} from '../../src/ui/chrome';
import { useWeather } from '../../src/weather/useWeather';

type Phase = 'overview' | 'setup' | 'play';
type Nine = 'all' | 'front' | 'back';
type TapMode = 'target' | 'ball' | 'tee';
interface Round {
  teeSet: string;
  nine: Nine;
}

const DRIVING_MPS = 2.5; // ~5.6 mph: faster than anyone walks a course

function loadRound(course: Course): Round {
  const fallback: Round = { teeSet: course.teeSets[0]?.id ?? '', nine: 'all' };
  try {
    const r = JSON.parse(
      sessionStorage.getItem(`golf.round.${course.id}`) ?? 'null',
    ) as Round | null;
    if (
      r &&
      course.teeSets.some((t) => t.id === r.teeSet) &&
      ['all', 'front', 'back'].includes(r.nine)
    )
      return r;
  } catch {
    /* no storage */
  }
  return fallback;
}
function saveRound(course: Course, r: Round) {
  try {
    sessionStorage.setItem(`golf.round.${course.id}`, JSON.stringify(r));
  } catch {
    /* no storage */
  }
}

export default function CourseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <CourseProvider id={id}>
      <Stack.Screen options={{ headerShown: false, title: 'Course' }} />
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <CourseGate>{(c) => <CourseBody {...c} />}</CourseGate>
      </View>
    </CourseProvider>
  );
}

function CourseBody({ course, features }: { course: Course; features: FeatureCollection }) {
  const router = useRouter();
  const params = useLocalSearchParams<{ hole?: string }>();
  const holeNumber = Number(params.hole) || 0;
  const hole = course.holes.find((h) => h.number === holeNumber) ?? null;
  const [phase, setPhase] = useState<Phase>(hole ? 'play' : 'overview');
  const [round, setRoundState] = useState(() => loadRound(course));
  const setRound = (r: Round) => {
    setRoundState(r);
    saveRound(course, r);
  };
  const scene = useRef<CourseSceneHandle>(null);
  const [ready, setReady] = useState(false);
  const [flat, setFlat] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const weather = useWeather(course.location);
  const tapRef = useRef<((p: LngLat) => void) | null>(null); // only Play listens for taps

  // the URL decides: ?hole=n plays, no hole shows the course
  useEffect(() => {
    setPhase((p) => (hole ? 'play' : p === 'play' ? 'overview' : p));
  }, [hole]);

  useEffect(() => {
    if (!ready) return;
    const h1 = firstHole(course, round.nine);
    if (phase === 'overview') scene.current?.overview(1.4);
    if (phase === 'setup' && h1) scene.current?.frame(h1.playLine[0]!, h1.pin, 2.2);
  }, [ready, phase, round.nine]);

  const start = () => {
    const h1 = firstHole(course, round.nine);
    if (!h1) return;
    setPhase('play');
    router.setParams({ hole: String(h1.number) });
  };

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: course.name }} />
      <CourseScene
        ref={scene}
        course={course}
        features={features}
        focusTop={phase === 'play' ? 0.3 : 0.4}
        onTapGround={(p) => tapRef.current?.(p)}
        onReady={() => setReady(true)}
        onError={setError}
      />
      {phase === 'overview' && (
        <Overview course={course} live={weather} error={error} onPlay={() => setPhase('setup')} />
      )}
      {phase === 'setup' && (
        <Setup
          course={course}
          round={round}
          onChange={setRound}
          onBack={() => setPhase('overview')}
          onStart={start}
        />
      )}
      {phase === 'play' && hole && (
        <Play
          key={hole.number}
          course={course}
          features={features}
          hole={hole}
          round={round}
          ready={ready}
          error={error}
          scene={scene}
          weather={weather}
          flat={flat}
          setFlat={setFlat}
          setTap={(f) => (tapRef.current = f)}
          onExit={() => {
            scene.current?.setFlat(false);
            setFlat(false);
            setPhase('overview');
            router.setParams({ hole: '' });
          }}
        />
      )}
    </View>
  );
}

function holesFor(course: Course, nine: Nine) {
  const half = Math.ceil(course.holes.length / 2);
  return course.holes.filter((h) =>
    nine === 'front' ? h.number <= half : nine === 'back' ? h.number > half : true,
  );
}
const firstHole = (course: Course, nine: Nine) => holesFor(course, nine)[0] ?? null;

function Caption({ children }: { children: ReactNode }) {
  return (
    <Text
      style={{
        color: colors.muted,
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 1,
        fontFamily: fonts.heading,
      }}
    >
      {children}
    </Text>
  );
}

function Overview({
  course,
  live,
  error,
  onPlay,
}: {
  course: Course;
  live: ReturnType<typeof useWeather>;
  error: string | null;
  onPlay: () => void;
}) {
  return (
    <>
      <View pointerEvents="box-none" style={{ position: 'absolute', top: 12, left: 12, right: 12 }}>
        <Glass style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 }}>
          <Link href="/" asChild>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="All courses"
              style={{ padding: 6 }}
            >
              <Text style={{ color: colors.accent, fontSize: 20, fontWeight: '800' }}>‹</Text>
            </Pressable>
          </Link>
          <Text
            accessibilityRole="header"
            numberOfLines={1}
            style={{
              flex: 1,
              color: colors.text,
              fontSize: 18,
              fontWeight: '800',
              fontFamily: fonts.heading,
            }}
          >
            {course.name}
          </Text>
          <Link href="/settings" asChild>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="Settings"
              style={{ padding: 6 }}
            >
              <Text style={{ color: colors.muted, fontSize: 18 }}>⚙</Text>
            </Pressable>
          </Link>
        </Glass>
      </View>
      <Rise style={{ position: 'absolute', left: 12, right: 12, bottom: 12, alignItems: 'center' }}>
        <Glass style={{ gap: 10, width: '100%', maxWidth: 520 }}>
          <Text style={{ color: colors.muted, fontSize: 13 }}>{course.address}</Text>
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>
            Par {course.par} · {course.holes.length} holes · {course.teeSets.length} tee boxes
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <WeatherPill wx={live.wx} live={live.live} />
            <Link href={`/info?course=${course.id}`} asChild>
              <Pressable accessibilityRole="link" style={{ padding: 6 }}>
                <Text style={{ color: colors.accent, fontWeight: '700' }}>Course info ›</Text>
              </Pressable>
            </Link>
          </View>
          {error && <Text style={{ color: colors.warn }}>{error}</Text>}
          <MintButton label="Play here" onPress={onPlay} />
          <Text style={{ color: colors.muted, fontSize: 10 }}>
            Terrain: USGS 3DEP · Map data © OpenStreetMap contributors
          </Text>
        </Glass>
      </Rise>
    </>
  );
}

function Chip({
  on,
  label,
  onPress,
  children,
}: {
  on: boolean;
  label: string;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: on ? colors.accent : colors.line,
        backgroundColor: on ? 'rgba(62,230,196,0.12)' : 'rgba(255,255,255,0.04)',
        minWidth: 104,
      }}
    >
      {children}
    </Pressable>
  );
}

function Setup({
  course,
  round,
  onChange,
  onBack,
  onStart,
}: {
  course: Course;
  round: Round;
  onChange: (r: Round) => void;
  onBack: () => void;
  onStart: () => void;
}) {
  const { settings, update } = useSettings();
  const holes = holesFor(course, round.nine);
  const total = (teeId: string) => {
    let sum = 0;
    for (const h of holes) {
      const y = h.yards[teeId];
      if (typeof y !== 'number') return null; // never guess a scorecard yardage
      sum += y;
    }
    return sum;
  };
  return (
    <Rise style={{ position: 'absolute', left: 12, right: 12, bottom: 12, alignItems: 'center' }}>
      <Glass style={{ gap: 12, width: '100%', maxWidth: 520 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to the course"
            onPress={onBack}
            style={{ paddingRight: 10 }}
          >
            <Text style={{ color: colors.accent, fontSize: 20, fontWeight: '800' }}>‹</Text>
          </Pressable>
          <Text
            accessibilityRole="header"
            style={{
              color: colors.text,
              fontSize: 18,
              fontWeight: '800',
              fontFamily: fonts.heading,
            }}
          >
            Set up your round
          </Text>
        </View>
        <Caption>TEE BOX</Caption>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8 }}
        >
          {course.teeSets.map((t) => {
            const y = total(t.id);
            return (
              <Chip
                key={t.id}
                on={round.teeSet === t.id}
                label={`${t.name} tees`}
                onPress={() => onChange({ ...round, teeSet: t.id })}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 5,
                      backgroundColor: t.color ?? colors.muted,
                      borderWidth: 1,
                      borderColor: 'rgba(0,0,0,0.3)',
                    }}
                  />
                  <Text
                    style={{ color: colors.text, fontWeight: '800', fontFamily: fonts.heading }}
                  >
                    {t.name}
                  </Text>
                </View>
                <Text style={{ color: colors.muted, fontSize: 12 }}>
                  {y ? `${y} yds` : 'Yardage n/a'}
                </Text>
                {t.rating !== null && t.slope !== null && (
                  <Text style={{ color: colors.muted, fontSize: 11 }}>
                    {t.rating} / {t.slope}
                  </Text>
                )}
              </Chip>
            );
          })}
        </ScrollView>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <Caption>HOLES</Caption>
          <Segmented
            label="Holes"
            value={round.nine}
            options={[
              ['all', `${course.holes.length} holes`],
              ['front', 'Front 9'],
              ['back', 'Back 9'],
            ]}
            onChange={(nine) => onChange({ ...round, nine })}
          />
        </View>
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <Caption>ACCOUNT FOR WEATHER</Caption>
          <Switch
            accessibilityLabel="Account for weather"
            value={settings.weather}
            onValueChange={(weather) => update({ weather })}
            trackColor={{ true: colors.accentDeep, false: '#3a4a5c' }}
            thumbColor="#ffffff"
          />
        </View>
        <MintButton label="Start round" onPress={onStart} />
      </Glass>
    </Rise>
  );
}

function Stat({ k, v, label }: { k: string; v: string; label?: string }) {
  return (
    <View
      accessibilityLabel={label}
      style={{
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,0.06)',
      }}
    >
      <Text style={{ color: colors.muted, fontSize: 10, fontWeight: '700' }}>{k}</Text>
      <Text
        style={{ color: colors.text, fontSize: 14, fontWeight: '800', fontFamily: fonts.heading }}
      >
        {v}
      </Text>
    </View>
  );
}

function GreenStat({ g }: { g: { front: number; center: number; back: number } }) {
  const n = { color: colors.muted, fontSize: 12, fontWeight: '700' as const };
  return (
    <View
      style={{
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 10,
        backgroundColor: 'rgba(62,230,196,0.12)',
      }}
    >
      <Text style={{ color: colors.muted, fontSize: 10, fontWeight: '700' }}>GREEN F · C · B</Text>
      <Text>
        <Text style={n}>{Math.round(g.front)} · </Text>
        <Text
          accessibilityLabel="Center of green"
          style={{ color: colors.text, fontSize: 14, fontWeight: '800', fontFamily: fonts.heading }}
        >
          {Math.round(g.center)}
        </Text>
        <Text style={n}> · {Math.round(g.back)}</Text>
      </Text>
    </View>
  );
}

const signed = (y: number) => {
  const r = Math.round(y);
  return `${r >= 0 ? '+' : '−'}${Math.abs(r)}`;
};

function Play({
  course,
  features,
  hole,
  round,
  ready,
  error,
  scene,
  weather,
  flat,
  setFlat,
  setTap,
  onExit,
}: {
  course: Course;
  features: FeatureCollection;
  hole: Course['holes'][number];
  round: Round;
  ready: boolean;
  error: string | null;
  scene: React.RefObject<CourseSceneHandle | null>;
  weather: ReturnType<typeof useWeather>;
  flat: boolean;
  setFlat: (f: boolean) => void;
  setTap: (f: ((p: LngLat) => void) | null) => void;
  onExit: () => void;
}) {
  const router = useRouter();
  const { settings } = useSettings();
  const loc = useLocation();
  const [mode, setMode] = useState<TapMode>('target');
  const [target, setTarget] = useState<LngLat | null>(null);
  const [ball, setBall] = useState<LngLat | null>(null);
  const [teeMoved, setTeeMoved] = useState<LngLat | null>(() => teeFor(course.id, hole.number));
  const [recenter, setRecenter] = useState(0);

  const tee = teeMoved ?? hole.playLine[0]!;
  const d = computeDistances(hole, features, loc, target, { tee, ball });
  const from = d.from;
  const aim = target ?? hole.pin;
  const m = ready ? scene.current?.measure(from, aim) : null;
  const stats = m && m.yards >= 3 ? shotStats(m, weather.wx, settings.weather) : null;
  const fix = loc.fix;
  const onCourse = !!fix && distanceYards(fix.at, hole.green.center) <= OFF_COURSE_YARDS;
  const driving =
    onCourse && fix.speedMps !== null && fix.speedMps > DRIVING_MPS && fix.headingDeg !== null
      ? { at: fix.at, headingDeg: fix.headingDeg }
      : null;

  const key = [
    from,
    aim,
    tee,
    target,
    driving?.at,
    driving?.headingDeg,
    stats?.club,
    stats?.playsLike,
  ].join('|');
  useEffect(() => {
    if (!ready) return;
    scene.current?.setShot({
      tee,
      ball: from,
      target,
      aim,
      flight: stats?.advice.flight.pts ?? null,
      driving,
    });
  }, [ready, key]);

  // the camera only moves when the hole changes or on request, never while you place things
  useEffect(() => {
    if (ready) scene.current?.frame(from, aim, 1.6);
  }, [ready, hole.number, recenter]);

  useEffect(() => {
    setTap((p) => {
      if (mode === 'ball') setBall(p);
      else if (mode === 'tee') {
        setTee(course.id, hole.number, p);
        setTeeMoved(p);
      } else setTarget(p);
    });
    return () => setTap(null);
  }, [mode, hole.number]);

  // a deep link outside the chosen nine navigates the whole course
  const nine = holesFor(course, round.nine);
  const holes = nine.some((h) => h.number === hole.number) ? nine : course.holes;
  const idx = holes.findIndex((h) => h.number === hole.number);
  const go = (k: number) => {
    const h = holes[k - 1] ?? null; // k counts within the chosen nine
    if (h) router.setParams({ hole: String(h.number) });
  };
  const elevUnits = (dz: number) =>
    settings.elevUnit === 'ft' ? `${signed(dz * 3.28084)} ft` : `${signed(dz)} m`;
  const detailed = settings.hud === 'detailed';

  const hint =
    mode === 'ball'
      ? 'Tap where your ball is'
      : mode === 'tee'
        ? 'Tap to move the tee box'
        : target
          ? 'Tap to move your landing spot'
          : 'Tap where you want to land it';

  return (
    <>
      <View pointerEvents="box-none" style={{ position: 'absolute', top: 10, left: 10, right: 10 }}>
        <Glass style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Course overview"
            onPress={onExit}
            style={{ paddingHorizontal: 8, paddingVertical: 4 }}
          >
            <Text style={{ color: colors.accent, fontSize: 22, fontWeight: '800' }}>⌂</Text>
          </Pressable>
          <View style={{ flex: 1, marginLeft: 4 }}>
            <HoleHeader hole={hole} course={course} teeId={round.teeSet} />
          </View>
          <HoleNav number={idx + 1} total={holes.length} onGo={(k) => go(k)} />
        </Glass>
      </View>

      <View pointerEvents="box-none" style={{ position: 'absolute', right: 10, top: 86, gap: 8 }}>
        <FloatButton
          label={flat ? 'Show 3D course' : 'Show 2D map'}
          glyph={flat ? '3D' : '2D'}
          onPress={() => {
            scene.current?.setFlat(!flat);
            setFlat(!flat);
          }}
        />
        <FloatButton
          label="Use my location"
          glyph="GPS"
          active={d.origin === 'gps'}
          warn={!fix || d.offCourse}
          onPress={() => {
            setBall(null);
            if (mode === 'ball') setMode('target');
          }}
        />
        <FloatButton label="Recenter" glyph="◎" onPress={() => setRecenter((r) => r + 1)} />
        <Link href="/settings" asChild>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Settings"
            style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.glass,
              borderWidth: 1,
              borderColor: colors.line,
            }}
          >
            <Text style={{ color: colors.text, fontSize: 18 }}>⚙</Text>
          </Pressable>
        </Link>
      </View>

      <View
        pointerEvents="box-none"
        style={{ position: 'absolute', left: 10, right: 10, bottom: 10, alignItems: 'center' }}
      >
        <Glass style={{ gap: 10, width: '100%', maxWidth: 560 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              flexWrap: 'wrap',
            }}
          >
            <Segmented
              label="Tap to place"
              value={mode}
              options={[
                ['target', 'Target'],
                ['ball', 'Ball'],
                ['tee', 'Tee'],
              ]}
              onChange={setMode}
            />
            {mode === 'tee' && teeMoved && (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  clearTee(course.id, hole.number);
                  setTeeMoved(null);
                }}
              >
                <Text style={{ color: colors.accent, fontWeight: '700', fontSize: 13 }}>
                  Reset tee
                </Text>
              </Pressable>
            )}
            {mode === 'target' && target && (
              <Pressable accessibilityRole="button" onPress={() => setTarget(null)}>
                <Text style={{ color: colors.accent, fontWeight: '700', fontSize: 13 }}>
                  Aim at pin
                </Text>
              </Pressable>
            )}
          </View>
          {(detailed || mode !== 'target') && (
            <Text style={{ color: colors.muted, fontSize: 12 }}>{hint}</Text>
          )}

          {error ? (
            <Text style={{ color: colors.warn }}>{error}</Text>
          ) : !ready ? (
            <Text style={{ color: colors.muted }}>Building the course…</Text>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 14 }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text
                  style={{
                    color: colors.muted,
                    fontSize: 11,
                    fontWeight: '800',
                    fontFamily: fonts.heading,
                  }}
                >
                  {target ? 'TO TARGET' : 'TO PIN'}
                </Text>
                <Text
                  accessibilityLabel="Straight distance"
                  style={{
                    color: colors.text,
                    fontSize: 34,
                    fontWeight: '800',
                    fontFamily: fonts.heading,
                  }}
                >
                  {stats?.straight ?? '–'}
                  <Text style={{ fontSize: 14, color: colors.muted }}> yds</Text>
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 2 }}>
                <Text
                  style={{
                    color: colors.muted,
                    fontSize: 11,
                    fontWeight: '800',
                    fontFamily: fonts.heading,
                  }}
                >
                  PLAYS LIKE
                </Text>
                <Text
                  accessibilityLabel="Plays like"
                  style={{
                    color: colors.accent,
                    fontSize: 34,
                    fontWeight: '800',
                    fontFamily: fonts.heading,
                  }}
                >
                  {stats ? Math.round(stats.playsLike) : '–'}
                  <Text style={{ fontSize: 14, color: colors.muted }}> yds</Text>
                </Text>
              </View>
            </View>
          )}

          {ready && stats && (
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              <Stat k="ELEV" v={`${signed(stats.elevation)} · ${elevUnits(m!.dz)}`} />
              {settings.weather ? (
                <>
                  <Stat k="WIND" v={signed(stats.wind)} />
                  <Stat k="AIR" v={signed(stats.air)} />
                </>
              ) : (
                <Stat k="WEATHER" v="Off" />
              )}
              <Stat k="CLUB" v={`${stats.club} · ${stats.swingPct}%`} />
              {d.green && <GreenStat g={d.green} />}
            </View>
          )}

          {detailed && (
            <>
              {d.targetToGreen !== null && (
                <Text style={{ color: colors.muted, fontSize: 12 }}>
                  Target to green center: {Math.round(d.targetToGreen)} yds
                </Text>
              )}
              <HazardList hazards={d.hazards} />
              <Text style={{ color: colors.muted, fontSize: 11 }}>
                {weather.live
                  ? `${Math.round(weather.wx.tempF)}°F · ${Math.round(weather.wx.rh)}% humidity · wind ${Math.round(weather.wx.windMph)} mph from ${compass(weather.wx.windFromDeg)}`
                  : 'No live weather — using standard air'}
              </Text>
            </>
          )}
          <Text style={{ color: colors.muted, fontSize: 10 }}>
            {d.notice && (
              <Text style={{ color: colors.warn, fontSize: 12 }}>{`${d.notice}\n`}</Text>
            )}
            {d.accuracyYards !== null && `GPS ±${Math.round(d.accuracyYards)} yds · `}
            Terrain: USGS 3DEP · Map data © OpenStreetMap contributors
          </Text>
        </Glass>
      </View>
    </>
  );
}
