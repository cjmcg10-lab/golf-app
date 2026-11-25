import { Link, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { filterCourses, loadCatalog, type CourseSummary } from '../src/course/catalog';
import { colors, fonts } from '../src/theme';
import { GolfBall } from '../src/ui/GolfBall';

export default function Launch() {
  const [list, setList] = useState<CourseSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    loadCatalog().then(setList, (e: Error) => setError(e.message));
  }, []);
  const shown = list ? filterCourses(list, q) : [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ headerShown: false, title: 'Golf' }} />
      <ScrollView
        contentContainerStyle={{
          padding: 20,
          gap: 14,
          maxWidth: 560,
          width: '100%',
          alignSelf: 'center',
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
          <Link href="/settings" asChild>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="Settings"
              style={{ padding: 6 }}
            >
              <Text style={{ color: colors.muted, fontSize: 20 }}>⚙</Text>
            </Pressable>
          </Link>
        </View>
        <View style={{ alignItems: 'center', marginTop: 4 }}>
          <GolfBall size={190} />
        </View>
        <Text
          accessibilityRole="header"
          style={{
            color: colors.text,
            fontSize: 26,
            fontWeight: '800',
            fontFamily: fonts.heading,
            textAlign: 'center',
          }}
        >
          Choose your course
        </Text>
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search courses or towns"
          placeholderTextColor={colors.muted}
          accessibilityLabel="Search courses"
          autoCorrect={false}
          style={{
            backgroundColor: 'rgba(255,255,255,0.06)',
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: 14,
            paddingHorizontal: 16,
            paddingVertical: 12,
            color: colors.text,
            fontSize: 16,
          }}
        />
        {!list && !error && <ActivityIndicator color={colors.accent} />}
        {error && <Text style={{ color: colors.warn }}>{error}</Text>}
        {list && shown.length === 0 && (
          <Text style={{ color: colors.muted, textAlign: 'center' }}>No courses match “{q}”.</Text>
        )}
        {shown.map((c) => (
          <Link key={c.id} href={`/course/${c.id}`} asChild>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={c.name}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 14,
                padding: 14,
                borderRadius: 16,
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor: colors.line,
              }}
            >
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  backgroundColor: 'rgba(62,230,196,0.14)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: colors.accent, fontSize: 20 }}>⛳</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    color: colors.text,
                    fontSize: 16,
                    fontWeight: '800',
                    fontFamily: fonts.heading,
                  }}
                >
                  {c.name}
                </Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>{c.address}</Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>
                  {c.holes} holes · Par {c.par}
                </Text>
              </View>
              <Text style={{ color: colors.muted, fontSize: 20 }}>›</Text>
            </Pressable>
          </Link>
        ))}
      </ScrollView>
    </View>
  );
}
