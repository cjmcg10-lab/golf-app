import type { Weather } from '@golf/physics';
import type { ReactNode } from 'react';
import { Platform, Pressable, Text, View, type ViewStyle } from 'react-native';
import { colors, fonts, mintGradient } from '../theme';

const web = Platform.OS === 'web';
const blur = web ? ({ backdropFilter: 'blur(12px)' } as ViewStyle) : null;

export function Glass({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return (
    <View
      style={[
        {
          backgroundColor: colors.glass,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: colors.line,
          padding: 12,
        },
        blur,
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Round-square floating button, as on the ski app's map. */
export function FloatButton({
  label,
  glyph,
  active,
  warn,
  onPress,
}: {
  label: string;
  glyph: string;
  active?: boolean;
  warn?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[
        {
          width: 48,
          height: 48,
          borderRadius: 14,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: active ? colors.accent : colors.glass,
          borderWidth: 1,
          borderColor: active ? colors.accentDeep : colors.line,
        },
        blur,
      ]}
    >
      <Text
        style={{
          color: active ? colors.onAccent : warn ? colors.warn : colors.text,
          fontSize: glyph.length > 2 ? 12 : 17,
          fontWeight: '800',
          fontFamily: fonts.heading,
        }}
      >
        {glyph}
      </Text>
    </Pressable>
  );
}

export function MintButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={[
        {
          backgroundColor: colors.accent,
          borderRadius: 14,
          paddingVertical: 12,
          paddingHorizontal: 18,
          alignItems: 'center',
          opacity: disabled ? 0.45 : 1,
        },
        web ? (mintGradient as ViewStyle) : null,
      ]}
    >
      <Text
        style={{
          color: colors.onAccent,
          fontWeight: '800',
          fontSize: 15,
          fontFamily: fonts.heading,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export const compass = (deg: number) => COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8]!;

export function WeatherPill({ wx, live }: { wx: Weather; live: boolean }) {
  return (
    <Glass style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999 }}>
      <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700' }}>
        {live
          ? `${Math.round(wx.tempF)}°F · wind ${Math.round(wx.windMph)} mph ${compass(wx.windFromDeg)}`
          : 'Standard air · no live weather'}
      </Text>
    </Glass>
  );
}
