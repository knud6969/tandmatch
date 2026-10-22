import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { CASE_FLOW_TEXTS } from "@/lib/cases/constants/case-flow";
import { colors, fontSize, MIN_TOUCH, radius, spacing } from "~/theme";

// Svar-kortene i chatten er fra "TandMatch", ikke fra AI'en (architecture 7.9): eget afsendernavn, tynd kant og intet AI-mærkat.
export const FLOW_CARD_SENDER = "TandMatch";

// Kortets ramme; accessibilityLabel nævner afsenderen, så en skærmlæser skelner kortet fra AI'ens beskeder.
export function FlowCard({ title, children, testID }: { title?: string; children: ReactNode; testID?: string }) {
  return (
    <View style={styles.card} testID={testID} accessibilityLabel={title ? `Fra ${FLOW_CARD_SENDER}: ${title}` : `Fra ${FLOW_CARD_SENDER}`}>
      <Text style={styles.sender}>{FLOW_CARD_SENDER}</Text>
      {title ? (
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

// Besvaret kort: én linje med svaret og "Ret", så længe sagen er en kladde.
export function FoldedCard({ label, value, onEdit, testID }: { label: string; value: string; onEdit: () => void; testID?: string }) {
  return (
    <View style={styles.folded} testID={testID}>
      <View style={styles.foldedText}>
        <Text style={styles.sender}>{FLOW_CARD_SENDER}</Text>
        <Text style={styles.foldedLabel}>{label}</Text>
        <Text style={styles.foldedValue} numberOfLines={2}>
          {value}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${CASE_FLOW_TEXTS.answeredEdit}: ${label}`}
        onPress={onEdit}
        style={styles.edit}
        hitSlop={4}
      >
        <Text style={styles.editText}>{CASE_FLOW_TEXTS.answeredEdit}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  sender: { fontSize: 12, lineHeight: 16, fontWeight: "600", color: colors.inkMuted, letterSpacing: 0.4 },
  title: { fontSize: fontSize.lg, lineHeight: 24, fontWeight: "600", color: colors.ink },
  folded: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    paddingVertical: spacing.sm,
  },
  foldedText: { flex: 1, gap: 2 },
  foldedLabel: { fontSize: fontSize.sm, color: colors.inkMuted },
  foldedValue: { fontSize: fontSize.md, fontWeight: "600", color: colors.ink },
  edit: { minHeight: MIN_TOUCH, minWidth: MIN_TOUCH, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.md },
  editText: { fontSize: fontSize.md, fontWeight: "600", color: colors.brand700 },
});
