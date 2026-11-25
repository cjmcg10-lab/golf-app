import type { Course, Hole } from '@golf/course-schema';
import { Text, View } from 'react-native';
import { colors, fonts } from '../theme';
import { displayYards } from './yards';

export function HoleHeader({ hole, course }: { hole: Hole; course: Course }) {
  const y = displayYards(hole, course);
  const parts = [`Par ${hole.par}`, `${y.yards} yds${y.tee ? ` (${y.tee})` : ''}`];
  if (hole.handicap !== null) parts.push(`HCP ${hole.handicap}`);
  return (
    <View>
      <Text style={{ color: colors.text, fontSize: 20, fontWeight: '800', fontFamily: fonts.heading }}>
        Hole {hole.number}
      </Text>
      <Text style={{ color: colors.muted, fontSize: 12 }}>{parts.join(' · ')}</Text>
    </View>
  );
}
