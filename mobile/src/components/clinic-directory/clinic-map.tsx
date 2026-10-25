import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import MapView, { Circle, Marker } from "react-native-maps";
import type { ClinicListItemDto } from "@/lib/clinics/types/clinics";
import { colors, radius, spacing, type } from "~/theme";
import { Button } from "~/components/ui";
import { RadiusSlider } from "~/components/clinic-directory/radius-slider";
import { BASIC_CLINIC_LABEL, VERIFIED_CLINIC_LABEL } from "@/lib/clinics/constants/clinic-texts";
import { clinicsWithLocation, regionForClinics, regionForRadius, regionKey, type LatLng } from "~/utils/map-region";

type Props = {
  clinics: ClinicListItemDto[];
  // Patientens udgangspunkt (afrundet position), hvis vi kender det; vises som diskret markør og afstandsradius.
  origin: LatLng | null;
  radiusKm: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  // Ny radius, når patienten slipper skyderen.
  onRadiusChange: (km: number) => void;
  onUsePosition: () => void;
  locating: boolean;
  height: number;
};

// Kortet i klinikoversigten. Samme klinikker i samme rækkefølge som listen; markørerne følger filtrene, fordi de kommer fra samme svar.
// Verificerede klinikker er udfyldte og blå med kryds; basisklinikker er hule og grå, så de kan kende forskel.
export function ClinicMap({ clinics, origin, radiusKm, selectedId, onSelect, onRadiusChange, onUsePosition, locating, height }: Props) {
  // Radius mens man trækker; cirklen og zoom følger med uden at hente klinikker.
  const [liveKm, setLiveKm] = useState(radiusKm);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setLiveKm(radiusKm), [radiusKm]);
  const ref = useRef<MapView>(null);
  const key = regionKey(clinics, origin);
  const lastKey = useRef<string | null>(null);

  // Kortet flytter sig kun, når klinikkerne eller udgangspunktet ændres, så patientens egen panorering ikke overstyres.
  useEffect(() => {
    if (lastKey.current !== null && lastKey.current !== key) ref.current?.animateToRegion(regionForClinics(clinics, origin), 300);
    lastKey.current = key;
  }, [key, clinics, origin]);

  return (
    <View style={[styles.wrap, { height }]}>
      <MapView
        ref={ref}
        style={StyleSheet.absoluteFill}
        initialRegion={regionForClinics(clinics, origin)}
        showsUserLocation={false}
        toolbarEnabled={false}
        pitchEnabled={false}
        rotateEnabled={false}
        onPress={() => onSelect(null)}
        accessibilityLabel="Kort med klinikker. Listen viser de samme klinikker."
      >
        {origin ? (
          <>
            <Circle
              center={{ latitude: origin.lat, longitude: origin.lng }}
              radius={liveKm * 1000}
              strokeColor={colors.brand200}
              fillColor="rgba(37, 99, 235, 0.06)"
              strokeWidth={1}
            />
            <Marker
              coordinate={{ latitude: origin.lat, longitude: origin.lng }}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={false}
              accessibilityLabel="Dit udgangspunkt"
              tappable={false}
            >
              <View style={styles.origin} />
            </Marker>
          </>
        ) : null}
        {clinicsWithLocation(clinics).map((clinic) => {
          const full = clinic.tier === "full";
          const selected = clinic.id === selectedId;
          return (
            <Marker
              key={`${clinic.id}-${selected}`}
              coordinate={{ latitude: clinic.location.lat, longitude: clinic.location.lng }}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={false}
              accessibilityLabel={`${clinic.name}, ${full ? VERIFIED_CLINIC_LABEL : BASIC_CLINIC_LABEL}`}
              onPress={(e) => {
                e.stopPropagation();
                onSelect(clinic.id);
              }}
            >
              <View style={[styles.pin, full ? styles.pinFull : styles.pinBasic, selected && styles.pinSelected]}>
                <Text style={[styles.pinGlyph, { color: full ? colors.onBrand : colors.inkMuted }]}>✚</Text>
              </View>
            </Marker>
          );
        })}
      </MapView>
      {origin ? (
        <View style={styles.overlay} pointerEvents="box-none">
          <RadiusSlider
            value={radiusKm}
            onChange={(km) => {
              setLiveKm(km);
              ref.current?.animateToRegion(regionForRadius(origin, km), 120);
            }}
            onCommit={onRadiusChange}
          />
        </View>
      ) : (
        <View style={styles.overlay} pointerEvents="box-none">
          <View style={styles.hint}>
            <Text style={type.caption}>Vælg postnummer eller brug din position for at sætte en afstand</Text>
            <Button label="Brug min position" variant="secondary" loading={locating} onPress={onUsePosition} />
          </View>
        </View>
      )}
      {/* Attributionen for kortdata vises af Apple Maps selv (logo nederst); der bruges ingen egne kortfliser. */}
    </View>
  );
}

const PIN = 32;

const styles = StyleSheet.create({
  wrap: { borderRadius: radius.lg, overflow: "hidden", borderWidth: 1, borderColor: colors.line },
  overlay: { position: "absolute", left: spacing.md, right: spacing.md, bottom: spacing.xl },
  hint: { backgroundColor: "rgba(255,255,255,0.94)", borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  pin: { width: PIN, height: PIN, borderRadius: PIN / 2, alignItems: "center", justifyContent: "center", borderWidth: 2 },
  pinFull: { backgroundColor: colors.brand600, borderColor: colors.onBrand },
  pinBasic: { backgroundColor: colors.surface, borderColor: colors.fieldBorder, borderStyle: "dashed" },
  pinSelected: { width: PIN + 10, height: PIN + 10, borderRadius: (PIN + 10) / 2, borderColor: colors.brand800 },
  pinGlyph: { fontSize: 16, fontWeight: "700" },
  origin: { width: 14, height: 14, borderRadius: 7, backgroundColor: colors.brand700, borderWidth: 3, borderColor: colors.onBrand },
});
