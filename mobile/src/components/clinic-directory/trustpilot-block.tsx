import { StyleSheet, Text, View } from "react-native";
import type { TrustpilotInfo } from "@/lib/types/common";
import { Button } from "~/components/ui";
import { colors, fontSize } from "~/theme";
import { formatDate, formatOneDecimal } from "~/utils/format";
import { trustpilotSource } from "~/utils/clinic-texts";

// Kort linje i klinikkort (uden link; hele kortet åbner profilen).
// Trustpilot vises altid med kilde og aldrig sammenblandet med platformens egne anmeldelser (CLAUDE.md, Anmeldelser).
export function TrustpilotLine({ trustpilot }: { trustpilot: TrustpilotInfo }) {
  if (!trustpilot) return null;
  return (
    <Text style={styles.muted}>
      <Text style={styles.strong}>Trustpilot</Text>
      {trustpilot.score !== null ? ` ${formatOneDecimal(trustpilot.score)}` : ""} ({trustpilotSource(trustpilot)})
    </Text>
  );
}

// Fuld visning på profilen, adskilt fra platformens egne anmeldelser. Linket åbnes af skærmen (expo-web-browser).
export function TrustpilotBlock({ trustpilot, onOpen }: { trustpilot: TrustpilotInfo; onOpen: (url: string) => void }) {
  if (!trustpilot) return <Text style={styles.muted}>Klinikken har ikke en Trustpilot-side, som vi kender til.</Text>;
  return (
    <View style={styles.box}>
      {trustpilot.score !== null ? (
        <Text style={styles.body}>
          <Text style={styles.big}>{formatOneDecimal(trustpilot.score)}</Text> af 5
          {trustpilot.reviewCount !== null ? <Text style={styles.muted}> · {trustpilot.reviewCount} anmeldelser</Text> : null}
        </Text>
      ) : (
        <Text style={styles.body}>Score er ikke angivet.</Text>
      )}
      <Text style={styles.muted}>
        Kilde: Trustpilot, {trustpilotSource(trustpilot)}
        {trustpilot.updatedAt ? `, opdateret d. ${formatDate(trustpilot.updatedAt)}` : ""}. TandMatch henter ikke selv tallene fra Trustpilot og kan ikke
        stå inde for dem.
      </Text>
      <Button label="Se klinikkens side på Trustpilot" variant="secondary" onPress={() => onOpen(trustpilot.url)} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 8 },
  body: { fontSize: fontSize.md, color: colors.ink },
  big: { fontSize: fontSize.xl, fontWeight: "700" },
  muted: { fontSize: fontSize.sm, color: colors.inkMuted },
  strong: { fontWeight: "700", color: colors.ink },
});
