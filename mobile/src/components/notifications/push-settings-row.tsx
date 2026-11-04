import { StyleSheet, Switch, Text, View } from "react-native";
import { PUSH_ACCOUNT_SWITCH, PUSH_ACCOUNT_TITLE, PUSH_DENIED_TEXT, PUSH_OPEN_SETTINGS, PUSH_PROMPT_ENABLE } from "@/lib/common/constants/notifications";
import { Button, Card } from "~/components/ui";
import { colors, fontSize, MIN_TOUCH } from "~/theme";
import type { PushPermission } from "~/utils/push-prompt";

type Props = {
  permission: PushPermission;
  receiving: boolean;
  onEnable: () => void;
  onToggle: (on: boolean) => void;
  onOpenSettings: () => void;
};

// Rækken "Notifikationer" i Konto (mobile 13.10): knap, besked om iPhone-indstillinger eller kontakt efter tilladelsen.
export function PushSettingsRow({ permission, receiving, onEnable, onToggle, onOpenSettings }: Props) {
  return (
    <Card>
      <Text accessibilityRole="header" style={styles.title}>
        {PUSH_ACCOUNT_TITLE}
      </Text>
      {permission === "undetermined" ? (
        <Button label={PUSH_PROMPT_ENABLE} onPress={onEnable} />
      ) : permission === "denied" ? (
        <>
          <Text style={styles.text}>{PUSH_DENIED_TEXT}</Text>
          <Button label={PUSH_OPEN_SETTINGS} variant="secondary" onPress={onOpenSettings} />
        </>
      ) : (
        <View style={styles.row}>
          <Text style={styles.text}>{PUSH_ACCOUNT_SWITCH}</Text>
          <Switch accessibilityLabel={PUSH_ACCOUNT_SWITCH} value={receiving} onValueChange={onToggle} trackColor={{ true: colors.brand600 }} />
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: fontSize.lg, fontWeight: "700", color: colors.ink },
  text: { fontSize: fontSize.md, color: colors.ink, flexShrink: 1 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: MIN_TOUCH, gap: 12 },
});
