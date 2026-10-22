import { Modal, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MAX_CONFIRMED_SERVICES_PER_CASE } from "@/lib/common/constants/limits";
import type { ServiceDto, ServiceGroupDto } from "@/lib/clinics/types/services";
import { Button, Checkbox, CheckboxText, LoadState } from "~/components/ui";
import { colors, fontSize, spacing } from "~/theme";

type Props = {
  visible: boolean;
  groups: ServiceGroupDto[] | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  selected: string[];
  onToggle: (service: ServiceDto) => void;
  onClose: () => void;
};

// "Vælg selv": kataloget grupperet efter kategori, højst MAX_CONFIRMED_SERVICES_PER_CASE valgt (architecture 7.9).
export function ServicePickerSheet({ visible, groups, loading, error, onRetry, selected, onToggle, onClose }: Props) {
  // Fravalgte behandlinger dæmpes ved loftet; de kan stadig fravælges, så patienten kan bytte.
  const full = selected.length >= MAX_CONFIRMED_SERVICES_PER_CASE;
  // pageSheet: arket kan lukkes med et træk på iOS; onRequestClose dækker Androids tilbage-knap.
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Text accessibilityRole="header" style={styles.title}>
            Vælg behandlinger
          </Text>
          <Text style={styles.muted}>
            Du kan vælge op til {MAX_CONFIRMED_SERVICES_PER_CASE}. Klinikken vurderer, hvad der faktisk passer. {selected.length} valgt.
          </Text>
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          <LoadState loading={loading} error={error} data={groups} onRetry={onRetry}>
            {(list) =>
              list.map((group) => (
                <View key={group.id} style={styles.group}>
                  <Text accessibilityRole="header" style={styles.groupName}>
                    {group.name}
                  </Text>
                  {group.services.map((service) => {
                    const checked = selected.includes(service.id);
                    return (
                      <View key={service.id} style={!checked && full ? styles.off : undefined}>
                        <Checkbox checked={checked} onChange={() => onToggle(service)} accessibilityLabel={service.name}>
                          <CheckboxText>{service.name}</CheckboxText>
                        </Checkbox>
                      </View>
                    );
                  })}
                </View>
              ))
            }
          </LoadState>
        </ScrollView>
        <View style={styles.footer}>
          <Button label="Færdig" onPress={onClose} />
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
