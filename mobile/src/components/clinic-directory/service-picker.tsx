import { Modal, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MAX_SELECTED_SERVICES } from "@/lib/constants/clinics";
import type { ServiceGroupDto } from "@/lib/types/services";
import { Button, Checkbox, CheckboxText } from "~/components/ui";
import { colors, fontSize, spacing } from "~/theme";

type Props = {
  visible: boolean;
  groups: ServiceGroupDto[];
  selected: string[];
  onToggle: (slug: string) => void;
  onClose: () => void;
};

// Valg af behandlinger (højst MAX_SELECTED_SERVICES), grupperet efter kataloget.
export function ServicePicker({ visible, groups, selected, onToggle, onClose }: Props) {
  const full = selected.length >= MAX_SELECTED_SERVICES;
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Text accessibilityRole="header" style={styles.title}>
            Vælg behandling
          </Text>
          <Text style={styles.muted}>Du kan vælge op til {MAX_SELECTED_SERVICES} behandlinger.</Text>
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          {groups.map((group) => (
            <View key={group.id} style={styles.group}>
              <Text accessibilityRole="header" style={styles.groupName}>
                {group.name}
              </Text>
              {group.services.map((service) => {
                const checked = selected.includes(service.slug);
                return (
                  <View key={service.id} style={!checked && full ? styles.off : undefined}>
                    <Checkbox checked={checked} onChange={() => onToggle(service.slug)} accessibilityLabel={service.name}>
                      <CheckboxText>{service.name}</CheckboxText>
                    </Checkbox>
                  </View>
                );
              })}
            </View>
          ))}
        </ScrollView>
        <View style={styles.footer}>
          <Button label="Vis klinikker" onPress={onClose} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  header: { padding: spacing.lg, gap: spacing.xs },
  title: { fontSize: fontSize.xl, fontWeight: "700", color: colors.ink },
  muted: { fontSize: fontSize.sm, color: colors.inkMuted },
  content: { paddingHorizontal: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xl },
  group: { gap: spacing.xs },
  groupName: { fontSize: fontSize.md, fontWeight: "700", color: colors.brand800, marginTop: spacing.sm },
  off: { opacity: 0.45 },
  footer: { padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.line },
});
