import { Stack, useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { useSettings } from '../src/settings/useSettings';
import { colors, fonts } from '../src/theme';
import { Segmented } from '../src/ui/chrome';

function Row({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 14,
        borderRadius: 16,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.line,
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15 }}>{title}</Text>
        <Text style={{ color: colors.muted, fontSize: 12 }}>{note}</Text>
      </View>
      {children}
    </View>
  );
}

export default function SettingsScreen() {
  const { settings, update } = useSettings();
  const router = useRouter();
  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{
        padding: 16,
        gap: 12,
        maxWidth: 560,
        width: '100%',
        alignSelf: 'center',
      }}
    >
      <Stack.Screen options={{ title: 'Settings' }} />
      <Text
        style={{ color: colors.muted, fontSize: 12, fontFamily: fonts.heading, fontWeight: '700' }}
      >
        DISTANCES
      </Text>
      <Row
        title="Account for weather"
        note="Include wind, temperature, humidity and air pressure in plays-like distances. Elevation always counts."
      >
        <Switch
          accessibilityLabel="Account for weather"
          value={settings.weather}
          onValueChange={(weather) => update({ weather })}
          trackColor={{ true: colors.accentDeep, false: '#3a4a5c' }}
          thumbColor="#ffffff"
        />
      </Row>
      <Row title="Elevation units" note="Height change between you and the target.">
        <Segmented
          label="Elevation units"
          value={settings.elevUnit}
          options={[
            ['ft', 'ft'],
            ['m', 'm'],
          ]}
          onChange={(elevUnit) => update({ elevUnit })}
        />
      </Row>
      <Text
        style={{
          color: colors.muted,
          fontSize: 12,
          fontFamily: fonts.heading,
          fontWeight: '700',
          marginTop: 8,
        }}
      >
        ON THE HOLE
      </Text>
      <Row
        title="Screen layout"
        note="Clean: target, plays-like and the green. Detailed: adds the breakdown, hazards and weather."
      >
        <Segmented
          label="Screen layout"
          value={settings.hud}
          options={[
            ['clean', 'Clean'],
            ['detailed', 'Detailed'],
          ]}
          onChange={(hud) => update({ hud })}
        />
      </Row>
      <Pressable
        accessibilityRole="link"
        onPress={() => (router.canGoBack() ? router.back() : router.navigate('/'))}
        style={{ padding: 8 }}
      >
        <Text style={{ color: colors.accent, fontWeight: '700' }}>‹ Back</Text>
      </Pressable>
    </ScrollView>
  );
}
