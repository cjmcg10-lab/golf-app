import { View } from 'react-native';

/** The 3D ball ships with the web build; native gets a plain white circle until M5. */
export function GolfBall({ size = 200 }: { size?: number }) {
  return (
    <View
      style={{
        width: size * 0.7,
        height: size * 0.7,
        borderRadius: size,
        backgroundColor: '#f7f8fa',
      }}
    />
  );
}
