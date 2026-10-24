import { Linking, StyleSheet, View } from "react-native";
import MapView, { Marker } from "react-native-maps";
import { Button } from "~/components/ui";
import { colors, radius, spacing } from "~/theme";
import { directionsUrl, regionForClinic, type LatLng } from "~/utils/map-region";

// Lille kort på klinikprofilen med klinikkens placering og en knap til vejvisning i telefonens kortapp.
export function ClinicLocationMap({ name, location }: { name: string; location: LatLng }) {
  const coordinate = { latitude: location.lat, longitude: location.lng };
  return (
    <View style={styles.wrap}>
      <View style={styles.map}>
        <MapView
          style={StyleSheet.absoluteFill}
          initialRegion={regionForClinic(location)}
          scrollEnabled={false}
          zoomEnabled={false}
          pitchEnabled={false}
          rotateEnabled={false}
          toolbarEnabled={false}
          accessibilityLabel={`Kort med placeringen af ${name}`}
        >
          <Marker coordinate={coordinate} accessibilityLabel={name} pinColor={colors.brand600} />
        </MapView>
      </View>
      <Button
        label="Vis vej"
        variant="secondary"
        accessibilityLabel={`Åbn vejvisning til ${name} i kortappen`}
        onPress={() => void Linking.openURL(directionsUrl(location, name))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  map: { height: 160, borderRadius: radius.lg, overflow: "hidden", borderWidth: 1, borderColor: colors.line },
});
