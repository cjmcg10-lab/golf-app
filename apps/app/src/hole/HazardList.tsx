import type { HazardDistance } from '@golf/geo';
import { Text, View } from 'react-native';
import { colors } from '../theme';

const LABEL: Record<string, string> = { bunker: 'Bunker', water: 'Water' };

/** Hazards ahead: "front – back" yards (carry to clear = back). */
export function HazardList({ hazards }: { hazards: HazardDistance[] }) {
  if (!hazards.length)
    return <Text style={{ color: colors.muted, fontSize: 12 }}>No bunkers or water ahead</Text>;
  return (
    <View style={{ gap: 2 }}>
      {hazards.slice(0, 4).map((h) => (
        <View key={h.id} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ color: h.kind === 'water' ? '#6fb4ff' : '#e8d9a8', fontSize: 13 }}>
            {LABEL[h.kind] ?? h.kind}
          </Text>
          <Text style={{ color: colors.text, fontSize: 13 }}>
            {Math.round(h.frontYards)} – {Math.round(h.backYards)}
          </Text>
        </View>
      ))}
    </View>
  );
}
