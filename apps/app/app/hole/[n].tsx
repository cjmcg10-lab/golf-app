import type { LngLat } from '@golf/course-schema';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { CourseGate } from '../../src/course/CourseGate';
import { DistancePanel } from '../../src/distances/DistancePanel';
import { useDistances } from '../../src/distances/useDistances';
import { HoleHeader } from '../../src/hole/HoleHeader';
import { HoleNav } from '../../src/hole/HoleNav';
import { useLocation } from '../../src/location/useLocation';
import { CourseMap } from '../../src/map/CourseMap';
import { colors } from '../../src/theme';

export default function HoleScreen() {
  const { n } = useLocalSearchParams<{ n: string }>();
  return (
    <CourseGate>
      {({ course, features }) => {
        const hole = course.holes.find((h) => String(h.number) === n);
        if (!hole)
          return <Text style={{ color: colors.text, padding: 24 }}>Hole {n} not found.</Text>;
        return (
          <HoleBody
            key={hole.number}
            course={course}
            features={features}
            holeNumber={hole.number}
          />
        );
      }}
    </CourseGate>
  );
}

function HoleBody({
  course,
  features,
  holeNumber,
}: {
  course: import('@golf/course-schema').Course;
  features: import('geojson').FeatureCollection;
  holeNumber: number;
}) {
  const router = useRouter();
  const hole = course.holes.find((h) => h.number === holeNumber)!;
  const [target, setTarget] = useState<LngLat | null>(null);
  const loc = useLocation();
  const d = useDistances(hole, features, loc, target);
  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: course.name }} />
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 12,
          paddingVertical: 8,
        }}
      >
        <View style={{ flex: 1 }}>
          <HoleHeader hole={hole} course={course} />
        </View>
        <HoleNav
          number={hole.number}
          total={course.holes.length}
          onGo={(k) => router.replace(`/hole/${k}`)}
        />
      </View>
      <View style={{ flex: 1 }}>
        <CourseMap
          course={course}
          features={features}
          holeNumber={hole.number}
          userLocation={loc.fix?.at ?? null}
          target={target}
          onTapPoint={setTarget}
        />
        <View
          style={{ position: 'absolute', left: 10, right: 10, bottom: 10 }}
          pointerEvents="box-none"
        >
          <DistancePanel d={d} onClearTarget={() => setTarget(null)} />
        </View>
      </View>
    </View>
  );
}
