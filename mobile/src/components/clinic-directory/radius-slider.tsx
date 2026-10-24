import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Slider from "@react-native-community/slider";
import { colors, radius, spacing, type } from "~/theme";
import { clampRadiusKm, MAX_RADIUS_KM, MIN_RADIUS_KM, radiusLabel } from "~/utils/map-region";

type Props = {
  value: number;
  // Kaldes live, mens man trækker (til cirklen og zoom).
  onChange: (km: number) => void;
  // Kaldes først, når man slipper (her sendes forespørgslen).
  onCommit: (km: number) => void;
};

// Skyder til radius, lagt diskret ovenpå kortet. Trin på 1 km; VoiceOver kan øge og mindske med ét trin.
export function RadiusSlider({ value, onChange, onCommit }: Props) {
  const [km, setKm] = useState(value);
  // Følger med, hvis radius ændres udefra (fx "Øg afstanden").
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setKm(value), [value]);

  function live(next: number) {
    const clamped = clampRadiusKm(next);
    if (clamped === km) return;
    setKm(clamped);
    onChange(clamped);
  }

  function step(delta: number) {
    const next = clampRadiusKm(km + delta);
    setKm(next);
    onChange(next);
    onCommit(next);
  }

  return (
    <View
      style={styles.panel}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Afstand fra udgangspunktet"
      accessibilityValue={{ min: MIN_RADIUS_KM, max: MAX_RADIUS_KM, now: km, text: `${km} km` }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(e) => step(e.nativeEvent.actionName === "increment" ? 1 : -1)}
    >
      <Text style={type.label}>{radiusLabel(km)}</Text>
      <Slider
        minimumValue={MIN_RADIUS_KM}
        maximumValue={MAX_RADIUS_KM}
        step={1}
        value={km}
        onValueChange={live}
        onSlidingComplete={(v) => onCommit(clampRadiusKm(v))}
        minimumTrackTintColor={colors.brand600}
        maximumTrackTintColor={colors.line}
        thumbTintColor={colors.brand600}
        accessible={false}
        importantForAccessibility="no"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: "rgba(255,255,255,0.94)", borderRadius: radius.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: 2 },
});
