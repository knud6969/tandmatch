import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { CONSENT_TEXTS, CONSENT_TYPE_LABEL } from "@/lib/constants/consents";
import type { ConsentType } from "@/lib/common/types/common";
import { Button, Checkbox, CheckboxText, StatusMessage } from "~/components/ui";
import { colors, fontSize, radius, spacing } from "~/theme";

type Props = {
  type: Extract<ConsentType, "ai_processing" | "image_upload" | "health_data_sharing">;
  onGrant: () => void;
  pending: boolean;
  error: string | null;
  actionLabel?: string;
};

// Særskilt samtykke lige før handlingen (architecture 9.4). Aldrig forudafkrydset og aldrig samlet med andre samtykker.
export function ConsentGate({ type, onGrant, pending, error, actionLabel = "Giv samtykke og fortsæt" }: Props) {
  const [checked, setChecked] = useState(false);
  return (
    <View style={styles.box}>
      <Text accessibilityRole="header" style={styles.title}>
        {CONSENT_TYPE_LABEL[type]}
      </Text>
      <Checkbox checked={checked} onChange={setChecked} accessibilityLabel={`Jeg giver mit samtykke: ${CONSENT_TEXTS[type]}`}>
        <CheckboxText>{CONSENT_TEXTS[type]}</CheckboxText>
      </Checkbox>
      {error ? <StatusMessage message={error} tone="danger" /> : null}
      <Button label={actionLabel} onPress={onGrant} disabled={!checked} loading={pending} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: spacing.md, backgroundColor: colors.infoBg, borderColor: colors.infoLine, borderWidth: 1, borderRadius: radius.md, padding: spacing.lg },
  title: { fontSize: fontSize.lg, fontWeight: "700", color: colors.ink },
});
