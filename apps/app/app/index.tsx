import { Link, Stack } from 'expo-router';
import { useRef } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { CourseGate } from '../src/course/CourseGate';
import { displayYards } from '../src/hole/yards';
import { CourseScene } from '../src/scene/CourseScene';
import type { CourseSceneHandle } from '../src/scene/types';
import { colors, fonts } from '../src/theme';
import { Glass, WeatherPill } from '../src/ui/chrome';
import { useWeather } from '../src/weather/useWeather';

export default function Home() {
  return (
    <CourseGate>
      {({ course, features }) => <HomeBody course={course} features={features} />}
    </CourseGate>
  );
}

function HomeBody({
  course,
  features,
}: {
  course: import('@golf/course-schema').Course;
  features: import('geojson').FeatureCollection;
}) {
  const scene = useRef<CourseSceneHandle>(null);
  const weather = useWeather(course.location);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ headerShown: false, title: course.name }} />
      <CourseScene
        ref={scene}
        course={course}
        features={features}
        focusTop={0.32}
        onReady={() => scene.current?.overview()}
      />
      <View
        pointerEvents="box-none"
        style={{ position: 'absolute', top: 12, left: 12, right: 12, gap: 8 }}
      >
        <Glass style={{ alignSelf: 'flex-start', borderRadius: 16 }}>
          <Text
            style={{
              color: colors.text,
              fontSize: 18,
              fontWeight: '800',
              fontFamily: fonts.heading,
            }}
          >
            {course.name}
          </Text>
          <Text style={{ color: colors.muted, fontSize: 12 }}>
            Par {course.par} · {course.holes.length} holes · Plantsville, CT
          </Text>
        </Glass>
        <View style={{ alignSelf: 'flex-start' }}>
          <WeatherPill {...weather} />
        </View>
      </View>
      <View
        pointerEvents="box-none"
        style={{ position: 'absolute', left: 10, right: 10, bottom: 10, maxHeight: '46%' }}
      >
        <Glass style={{ padding: 12, gap: 10 }}>
          <View
            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <Text style={{ color: colors.text, fontWeight: '800', fontFamily: fonts.heading }}>
              Pick a hole
            </Text>
            <Link href="/info" asChild>
              <Pressable accessibilityRole="link">
                <Text style={{ color: colors.accent, fontWeight: '700' }}>
                  Course info & calls ›
                </Text>
              </Pressable>
            </Link>
          </View>
          <ScrollView contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {course.holes.map((h) => (
              <Link key={h.number} href={`/hole/${h.number}`} asChild>
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={`Hole ${h.number}`}
                  style={{
                    width: '15%',
                    minWidth: 48,
                    flexGrow: 1,
                    alignItems: 'center',
                    paddingVertical: 8,
                    borderRadius: 12,
                    backgroundColor: 'rgba(255,255,255,0.06)',
                    borderWidth: 1,
                    borderColor: colors.line,
                  }}
                >
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: 18,
                      fontWeight: '800',
                      fontFamily: fonts.heading,
                    }}
                  >
                    {h.number}
                  </Text>
                  <Text style={{ color: colors.muted, fontSize: 10 }}>
                    P{h.par} · {displayYards(h, course).yards}
                  </Text>
                </Pressable>
              </Link>
            ))}
          </ScrollView>
          <Text style={{ color: colors.muted, fontSize: 10 }}>
            Terrain: USGS 3DEP · Map data © OpenStreetMap contributors
          </Text>
        </Glass>
      </View>
    </View>
  );
}
