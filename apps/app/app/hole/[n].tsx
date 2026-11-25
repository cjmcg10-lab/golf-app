import type { Course, LngLat } from '@golf/course-schema';
import { distanceYards } from '@golf/geo';
import { caddy, carryYards, type Advice } from '@golf/physics';
import type { FeatureCollection } from 'geojson';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { CourseGate } from '../../src/course/CourseGate';
import { DistancePanel } from '../../src/distances/DistancePanel';
import { OFF_COURSE_YARDS, useDistances } from '../../src/distances/useDistances';
import { HoleHeader } from '../../src/hole/HoleHeader';
import { HoleNav } from '../../src/hole/HoleNav';
import { useLocation } from '../../src/location/useLocation';
import { CourseMap } from '../../src/map/CourseMap';
import { CourseScene } from '../../src/scene/CourseScene';
import type { CourseSceneHandle } from '../../src/scene/types';
import { colors, fonts } from '../../src/theme';
import { compass, FloatButton, Glass, MintButton } from '../../src/ui/chrome';
import { useWeather } from '../../src/weather/useWeather';

export default function HoleScreen() {
  const { n } = useLocalSearchParams<{ n: string }>();
  return (
    <CourseGate>
      {({ course, features }) => {
        const hole = course.holes.find((h) => String(h.number) === n);
        if (!hole)
          return <Text style={{ color: colors.text, padding: 24 }}>Hole {n} not found.</Text>;
        return <HoleBody course={course} features={features} holeNumber={hole.number} />;
      }}
    </CourseGate>
  );
}

type StartMode = 'tee' | 'gps' | 'ball' | 'pick';

function HoleBody({
  course,
  features,
  holeNumber,
}: {
  course: Course;
  features: FeatureCollection;
  holeNumber: number;
}) {
  const router = useRouter();
  const hole = course.holes.find((h) => h.number === holeNumber)!;
  const next = course.holes.find((h) => h.number === holeNumber + 1) ?? null;
  const scene = useRef<CourseSceneHandle>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flat, setFlat] = useState(false);
  const [mode, setMode] = useState<StartMode>('tee');
  const [ball, setBall] = useState<LngLat | null>(null);
  const [target, setTarget] = useState<LngLat | null>(null);
  const [busy, setBusyState] = useState(false);
  const busyRef = useRef(false); // read synchronously by handlers that fire before a re-render
  const setBusy = (b: boolean) => {
    busyRef.current = b;
    setBusyState(b);
  };
  const [result, setResult] = useState<string | null>(null);
  const loc = useLocation();
  const weather = useWeather(course.location);
  const d = useDistances(hole, features, loc, target);

  // a new hole starts on its tee
  useEffect(() => {
    setMode('tee');
    setBall(null);
    setTarget(null);
    setResult(null);
  }, [holeNumber]);

  const gps =
    loc.fix && distanceYards(loc.fix.at, hole.green.center) <= OFF_COURSE_YARDS ? loc.fix.at : null;
  const tee = hole.playLine[0]!;
  const start: LngLat =
    mode !== 'tee' && ball ? ball : tee; // GPS is captured once when chosen, so fixes don't jitter
  const aim = target ?? hole.pin ?? hole.green.center;
  const sKey = start.join();
  const aKey = aim.join();

  const advice = useMemo<Advice | null>(() => {
    if (!ready || flat) return null;
    const m = scene.current?.measure(start, aim);
    if (!m || m.yards < 3) return null;
    return caddy(m.yards, m.bearing, m.dz, weather.wx);
  }, [ready, flat, sKey, aKey, weather.wx]);

  useEffect(() => {
    if (!ready || busy || flat) return;
    scene.current?.setShot({ start, target, aim, advice });
  }, [ready, busy, flat, sKey, aKey, advice, holeNumber]);

  const onTap = (p: LngLat) => {
    if (busyRef.current) return;
    if (mode === 'pick') {
      setBall(p);
      setMode('ball');
    } else setTarget(p);
  };

  const hit = async () => {
    if (!advice || !scene.current || busyRef.current) return;
    setBusy(true);
    setResult(null);
    const from = start;
    const rest = await scene.current.hit(advice);
    if (rest === undefined) {
      setBusy(false); // interrupted
      return;
    }
    const carry = Math.round(carryYards(advice.flight));
    if (rest) {
      const total = Math.round(scene.current.measure(from, rest)?.yards ?? carry);
      setResult(`${advice.club.name} · carry ${carry} · total ${total} yds`);
      setBall(rest);
      setMode('ball');
    } else {
      setResult(`${advice.club.name} · carry ${carry} · in the water — replay`);
      setBall(from);
      setMode('ball');
    }
    setTarget(null);
    setBusy(false);
  };

  const driveNext = async () => {
    if (!next || !scene.current || busyRef.current) return;
    setBusy(true);
    setResult(null);
    const arrived = await scene.current.driveTo(next.playLine[0]!, next.pin ?? next.green.center);
    setBusy(false);
    if (!arrived) return;
    router.setParams({ n: String(next.number) });
  };

  const go = (k: number) => !busyRef.current && router.setParams({ n: String(k) });

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ headerShown: false, title: course.name }} />
      {flat ? (
        <CourseMap
          course={course}
          features={features}
          holeNumber={hole.number}
          userLocation={loc.fix?.at ?? null}
          target={target}
          onTapPoint={setTarget}
        />
      ) : (
        <CourseScene
          ref={scene}
          course={course}
          features={features}
          focusTop={0.42}
          onTapGround={onTap}
          onReady={() => setReady(true)}
          onError={setError}
        />
      )}

      {/* top: hole card + distances */}
      <View
        pointerEvents="box-none"
        style={{ position: 'absolute', top: 10, left: 10, right: 10, gap: 8 }}
      >
        <Glass style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6 }}>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="All holes"
            onPress={() => router.navigate('/')}
            style={{ paddingHorizontal: 8, paddingVertical: 4 }}
          >
            <Text style={{ color: colors.accent, fontSize: 22, fontWeight: '800' }}>⌂</Text>
          </Pressable>
          <View style={{ flex: 1, marginLeft: 4 }}>
            <HoleHeader hole={hole} course={course} />
          </View>
          <HoleNav number={hole.number} total={course.holes.length} onGo={go} />
        </Glass>
        <DistancePanel d={d} onClearTarget={() => setTarget(null)} />
      </View>

      {/* right: floating buttons */}
      <View
        pointerEvents="box-none"
        style={{ position: 'absolute', right: 10, top: '42%', gap: 8 }}
      >
        <FloatButton
          label={flat ? 'Show 3D course' : 'Show 2D map'}
          glyph={flat ? '3D' : '2D'}
          onPress={() => {
            if (busyRef.current) return;
            setFlat((f) => !f);
            setReady(false);
          }}
        />
        <FloatButton
          label="Play from my location"
          glyph="GPS"
          active={mode === 'gps' && !!gps}
          warn={!gps}
          onPress={() => {
            if (busyRef.current || !gps) return;
            setBall(gps);
            setMode('gps');
          }}
        />
        <FloatButton
          label="Play from the tee"
          glyph="TEE"
          active={mode === 'tee'}
          onPress={() => !busyRef.current && setMode('tee')}
        />
        <FloatButton
          label="Pick where the ball is"
          glyph="⌖"
          active={mode === 'pick'}
          onPress={() => !busyRef.current && setMode('pick')}
        />
      </View>

      {/* bottom: caddy */}
      <View
        pointerEvents="box-none"
        style={{ position: 'absolute', left: 10, right: 10, bottom: 10, gap: 8 }}
      >

        <Glass style={{ gap: 8 }}>
          {error ? (
            <Text style={{ color: colors.warn }}>{error}</Text>
          ) : flat ? (
            <Text style={{ color: colors.muted }}>Switch to 3D to set up and play a shot.</Text>
          ) : !ready ? (
            <Text style={{ color: colors.muted }}>Building the course…</Text>
          ) : (
            <>
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                {mode === 'pick'
                  ? 'Tap the ground where your ball is'
                  : target
                    ? 'Tap again to move the target'
                    : 'Tap the ground to choose where to land it'}
              </Text>
              {advice && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text
                      accessibilityLabel="Caddy club"
                      style={{
                        color: colors.text,
                        fontSize: 22,
                        fontWeight: '800',
                        fontFamily: fonts.heading,
                      }}
                    >
                      {advice.club.name}
                      <Text style={{ color: colors.muted, fontSize: 13, fontWeight: '600' }}>
                        {`  ${Math.round(advice.speedFactor * 100)}% swing`}
                      </Text>
                    </Text>
                    <Text style={{ color: colors.muted, fontSize: 12 }}>
                      {`Carry ${Math.round(carryYards(advice.flight))} · plays like ${Math.round(advice.playsLike)} yds${aimNote(advice, scene.current?.measure(start, aim)?.bearing)}`}
                    </Text>
                  </View>
                  <MintButton label="Hit" onPress={hit} disabled={busy} />
                </View>
              )}
              <Text style={{ color: colors.muted, fontSize: 11 }}>{weatherLine(weather)}</Text>
              <Text style={{ color: colors.muted, fontSize: 10 }}>
                Terrain: USGS 3DEP · Map data © OpenStreetMap contributors
              </Text>
              {result && <Text style={{ color: colors.accent, fontWeight: '700' }}>{result}</Text>}
              {next && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Drive to hole ${next.number}`}
                  disabled={busy}
                  onPress={driveNext}
                >
                  <Text
                    style={{ color: colors.accent, fontWeight: '700', opacity: busy ? 0.4 : 1 }}
                  >
                    Drive the cart to hole {next.number} ›
                  </Text>
                </Pressable>
              )}
            </>
          )}
        </Glass>
      </View>
    </View>
  );
}

function aimNote(a: Advice, bearing: number | undefined) {
  if (bearing === undefined) return '';
  const off = ((a.aimDeg - bearing + 540) % 360) - 180;
  if (Math.abs(off) < 0.5) return '';
  return ` · aim ${Math.abs(off).toFixed(1)}° ${off > 0 ? 'right' : 'left'}`;
}

function weatherLine({ wx, live }: { wx: import('@golf/physics').Weather; live: boolean }) {
  return live
    ? `${Math.round(wx.tempF)}°F · ${Math.round(wx.rh)}% humidity · wind ${Math.round(wx.windMph)} mph from ${compass(wx.windFromDeg)}`
    : 'No live weather — using standard air';
}
