import type { Course } from '@golf/course-schema';
import type { FeatureCollection } from 'geojson';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { colors } from '../theme';
import { useCourse } from './CourseProvider';

/** Renders children once the course is loaded; otherwise a spinner or an error with Retry. */
export function CourseGate({
  children,
}: {
  children: (c: { course: Course; features: FeatureCollection }) => ReactNode;
}) {
  const { state, retry } = useCourse();
  if (state.status === 'ready') return <>{children(state)}</>;
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }}>
      {state.status === 'loading' ? (
        <ActivityIndicator color={colors.accent} />
      ) : (
        <>
          <Text style={{ color: colors.text, fontSize: 16, textAlign: 'center' }}>
            Couldn’t load the course.
          </Text>
          <Text style={{ color: colors.muted, textAlign: 'center' }}>{state.message}</Text>
          <Pressable
            onPress={retry}
            accessibilityRole="button"
            style={{
              backgroundColor: colors.accent,
              paddingHorizontal: 20,
              paddingVertical: 10,
              borderRadius: 8,
            }}
          >
            <Text style={{ color: colors.bg, fontWeight: '600' }}>Retry</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}
