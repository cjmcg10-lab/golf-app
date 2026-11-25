import type { Course } from '@golf/course-schema';
import { Linking, Pressable, Text, View } from 'react-native';
import { colors } from '../theme';
import { OfflineDownload } from './OfflineDownload';
import { formatPhone } from './phone';

const h2 = { color: colors.muted, fontSize: 12, letterSpacing: 1, marginTop: 8 } as const;

export function CourseInfo({ course }: { course: Course }) {
  const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${course.name}, ${course.address}`,
  )}`;
  return (
    <View style={{ padding: 16, gap: 10 }}>
      <Text style={{ color: colors.text, fontSize: 22, fontWeight: '700' }}>{course.name}</Text>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel="Directions"
        onPress={() => Linking.openURL(maps)}
      >
        <Text style={{ color: colors.accent }}>{course.address} ›</Text>
      </Pressable>

      <Text style={h2}>CALL</Text>
      {course.contacts.length === 0 && (
        <Text style={{ color: colors.muted }}>No phone numbers listed</Text>
      )}
      {course.contacts.map((c) => (
        <Pressable
          key={c.phone}
          accessibilityRole="button"
          accessibilityLabel={`Call ${c.label}`}
          onPress={() => Linking.openURL(`tel:${c.phone}`)}
          style={{
            backgroundColor: colors.card,
            borderRadius: 12,
            padding: 14,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <Text style={{ fontSize: 20 }}>📞</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontWeight: '600' }}>{c.label}</Text>
            <Text style={{ color: colors.muted }}>{formatPhone(c.phone)}</Text>
          </View>
          <Text style={{ color: colors.accent, fontWeight: '700' }}>Call</Text>
        </Pressable>
      ))}

      {course.website && (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Website"
          onPress={() => Linking.openURL(course.website!)}
        >
          <Text style={{ color: colors.accent }}>
            {course.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')} ›
          </Text>
        </Pressable>
      )}

      <Text style={h2}>OFFLINE</Text>
      <OfflineDownload course={course} />

      <Text style={h2}>DATA</Text>
      {course.attribution.map((a) => (
        <Text key={a} style={{ color: colors.muted, fontSize: 12 }}>
          {a}
        </Text>
      ))}
    </View>
  );
}
