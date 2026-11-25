import type { Weather } from '@golf/physics';
import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Platform, Pressable, Text, View, type ViewStyle } from 'react-native';
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

/** Pill-shaped segmented control. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
}) {
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={{
        flexDirection: 'row',
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderRadius: 12,
        padding: 3,
        gap: 2,
      }}
    >
      {options.map(([v, text]) => {
        const on = v === value;
        return (
          <Pressable
            key={v}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={text}
            onPress={() => onChange(v)}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 7,
              borderRadius: 9,
              backgroundColor: on ? colors.accent : 'transparent',
            }}
          >
            <Text
              style={{
                color: on ? colors.onAccent : colors.text,
                fontWeight: '800',
                fontSize: 13,
                fontFamily: fonts.heading,
              }}
            >
              {text}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Slides and fades its children in when it mounts (use a `key` to replay). */
export function Rise({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const k = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(k, { toValue: 1, duration: 380, useNativeDriver: false }).start();
  }, [k]);
  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        style,
        {
          opacity: k,
          transform: [{ translateY: k.interpolate({ inputRange: [0, 1], outputRange: [28, 0] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
