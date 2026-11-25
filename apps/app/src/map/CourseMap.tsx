import { Text, View } from 'react-native';
import { colors } from '../theme';
import type { CourseMapProps } from './types';

/** Native map arrives with the mobile build (M5); the web build uses CourseMap.web.tsx. */
export function CourseMap(_props: CourseMapProps) {
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.card,
      }}
    >
      <Text style={{ color: colors.muted }}>Map available in the mobile build</Text>
    </View>
  );
}
