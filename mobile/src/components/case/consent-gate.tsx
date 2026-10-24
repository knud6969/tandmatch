import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { CONSENT_TEXTS, CONSENT_TYPE_LABEL } from "@/lib/identity/constants/consents";
import type { ConsentType } from "@/lib/common/types/common";
import { Button, Checkbox, CheckboxText, StatusMessage } from "~/components/ui";
import { colors, fontSize, MIN_TOUCH, radius, spacing } from "~/theme";

type Props = {
  type: Extract<ConsentType, "ai_processing" | "image_upload" | "health_data_sharing">;
  onGrant: () => void;
  pending: boolean;
  error: string | null;
  actionLabel?: string;
};

// Særskilt samtykke lige før handlingen (architecture 9.4). Aldrig forudafkrydset og aldrig samlet med andre samtykker.
// Den godkendte tekst (CONSENT_TEXTS) vises uændret under en tydelig overskrift: de første linjer, resten bag "Læs hele teksten".
const PREVIEW_LINES = 2;

export function ConsentGate({ type, onGrant, pending, error, actionLabel = "Giv samtykke" }: Props) {
  const [checked, setChecked] = useState(false);
  const [expanded, setExpanded] = useState(false);
  return (
    <View style={styles.box}>
      <Text accessibilityRole="header" style={styles.title}>
        {CONSENT_TYPE_LABEL[type]}
      </Text>
      <Text style={styles.text} numberOfLines={expanded ? undefined : PREVIEW_LINES}>
        {CONSENT_TEXTS[type]}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={expanded ? "Vis mindre af samtykketeksten" : "Læs hele samtykketeksten"}
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((value) => !value)}
        style={styles.more}
      >
        <Text style={styles.moreText}>{expanded ? "Vis mindre" : "Læs hele teksten"}</Text>
      </Pressable>
      <Checkbox checked={checked} onChange={setChecked} accessibilityLabel={`Jeg giver mit samtykke: ${CONSENT_TEXTS[type]}`}>
        <CheckboxText>Jeg giver mit samtykke</CheckboxText>
      </Checkbox>
      {error ? <StatusMessage message={error} tone="danger" /> : null}
      <Button label={actionLabel} onPress={onGrant} disabled={!checked} loading={pending} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: spacing.sm, backgroundColor: colors.infoBg, borderColor: colors.infoLine, borderWidth: 1, borderRadius: radius.md, padding: spacing.lg },
  text: { fontSize: fontSize.sm, lineHeight: 20, color: colors.ink },
  more: { minHeight: MIN_TOUCH, justifyContent: "center", alignSelf: "flex-start" },
  moreText: { fontSize: fontSize.sm, fontWeight: "600", color: colors.brand700 },
  title: { fontSize: fontSize.lg, fontWeight: "700", color: colors.ink },
});
