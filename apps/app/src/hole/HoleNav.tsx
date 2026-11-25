import { Pressable, Text } from 'react-native';
import { colors } from '../theme';

function NavButton({
  label,
  glyph,
  disabled,
  onPress,
}: {
  label: string;
  glyph: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={disabled ? undefined : onPress}
      style={{ padding: 10, opacity: disabled ? 0.3 : 1 }}
    >
      <Text style={{ color: colors.text, fontSize: 22 }}>{glyph}</Text>
    </Pressable>
  );
}

export function HoleNav({
  number,
  total,
  onGo,
}: {
  number: number;
  total: number;
  onGo: (n: number) => void;
}) {
  return (
    <>
      <NavButton
        label="Previous hole"
        glyph="‹"
        disabled={number <= 1}
        onPress={() => onGo(number - 1)}
      />
      <NavButton
        label="Next hole"
        glyph="›"
        disabled={number >= total}
        onPress={() => onGo(number + 1)}
      />
    </>
  );
}
