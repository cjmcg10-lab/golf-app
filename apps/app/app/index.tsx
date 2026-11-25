import { Link, Stack } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { CourseGate } from '../src/course/CourseGate';
import { displayYards } from '../src/hole/yards';
import { CourseMap } from '../src/map/CourseMap';
import { colors } from '../src/theme';

export default function Home() {
  return (
    <CourseGate>
      {({ course, features }) => (
        <View style={{ flex: 1 }}>
          <Stack.Screen options={{ title: course.name }} />
          <View style={{ height: '42%', minHeight: 240 }}>
            <CourseMap course={course} features={features} />
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Text style={{ color: colors.muted }}>
                Par {course.par} · {course.holes.length} holes
              </Text>
              <Link href="/info" asChild>
                <Pressable accessibilityRole="link">
                  <Text style={{ color: colors.accent, fontWeight: '600' }}>
                    Course info & calls ›
                  </Text>
                </Pressable>
              </Link>
            </View>
            {course.holes.map((h) => {
              const y = displayYards(h, course);
              return (
                <Link key={h.number} href={`/hole/${h.number}`} asChild>
                  <Pressable
                    accessibilityRole="link"
                    accessibilityLabel={`Hole ${h.number}`}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      backgroundColor: colors.card,
                      borderRadius: 10,
                      padding: 12,
                      gap: 12,
                    }}
                  >
                    <Text
                      style={{ color: colors.text, fontSize: 20, fontWeight: '700', width: 32 }}
                    >
                      {h.number}
                    </Text>
                    <Text style={{ color: colors.text, flex: 1 }}>
                      Par {h.par} · {y.yards} yds
                    </Text>
                    {h.handicap !== null && (
                      <Text style={{ color: colors.muted, fontSize: 12 }}>HCP {h.handicap}</Text>
                    )}
                    <Text style={{ color: colors.muted }}>›</Text>
                  </Pressable>
                </Link>
              );
            })}
          </ScrollView>
        </View>
      )}
    </CourseGate>
  );
}
