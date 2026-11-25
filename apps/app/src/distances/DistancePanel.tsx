import { Pressable, Text, View } from 'react-native';
import { HazardList } from '../hole/HazardList';
import { colors, fonts } from '../theme';
import type { Distances } from './useDistances';

const fmt = (y: number | undefined | null) => (y == null ? '—' : String(Math.round(y)));

function Small({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ alignItems: 'center', minWidth: 56 }}>
      <Text style={{ color: colors.muted, fontSize: 11 }}>{label}</Text>
      <Text
        accessibilityLabel={`${label} of green`}
        style={{ color: colors.text, fontSize: 18, fontWeight: '600' }}
      >
        {value}
      </Text>
    </View>
  );
}

export function DistancePanel({ d, onClearTarget }: { d: Distances; onClearTarget?: () => void }) {
  return (
    <View
      style={{
        backgroundColor: colors.glass,
        borderRadius: 14,
        padding: 12,
        gap: 8,
        borderWidth: 1,
        borderColor: colors.line,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Small label="Front" value={fmt(d.green?.front)} />
        <View style={{ alignItems: 'center' }}>
          <Text style={{ color: colors.muted, fontSize: 11 }}>CENTER</Text>
          <Text
            accessibilityLabel="Center of green"
            style={{ color: colors.accent, fontSize: 40, fontWeight: '800', lineHeight: 44, fontFamily: fonts.heading }}
          >
            {fmt(d.green?.center)}
          </Text>
        </View>
        <Small label="Back" value={fmt(d.green?.back)} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <HazardList hazards={d.hazards} />
        </View>
      </View>
      {d.toTarget != null && (
        <Pressable
          onPress={onClearTarget}
          accessibilityRole="button"
          accessibilityHint="Clears the target"
        >
          <Text style={{ color: '#ffd23f', fontSize: 14 }}>
            {`To target ${fmt(d.toTarget)} · then ${fmt(d.targetToGreen)} to green`}
          </Text>
        </Pressable>
      )}
      {(d.notice || d.accuracyYards != null) && (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
          {d.notice && (
            <Text style={{ color: colors.warn, fontSize: 12, flex: 1 }}>{d.notice}</Text>
          )}
          {d.accuracyYards != null && (
            <Text
              style={{ color: colors.warn, fontSize: 12 }}
            >{`GPS ±${d.accuracyYards} yds`}</Text>
          )}
        </View>
      )}
    </View>
  );
}
