import { forwardRef } from 'react';
import { Text, View } from 'react-native';
import { colors } from '../theme';
import type { CourseSceneHandle, CourseSceneProps } from './types';

/** The 3D course ships on the web first; the mobile build gets it in M5. */
export const CourseScene = forwardRef<CourseSceneHandle, CourseSceneProps>(function CourseScene() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: colors.muted }}>3D course available on the web</Text>
    </View>
  );
});
