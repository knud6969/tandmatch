import { StyleSheet, Text, View } from "react-native";
import { OUT_OF_SCOPE_NOTICES } from "@/lib/cases/constants/ai-texts";
import type { AiChatMessageDto } from "@/lib/cases/types/ai";
import { Badge, StatusMessage } from "~/components/ui";
import { colors, fontSize, radius, spacing } from "~/theme";

// Foreløbig vurdering med mærkat, evt. faste beskeder om pris og klinikanbefaling, og forslag til behandlinger (architecture 7.3).
function AssistantExtras({ message }: { message: AiChatMessageDto }) {
  return (
    <View style={styles.extras}>
      {message.preliminaryAssessment ? (
        <View style={styles.assessment} testID="foreloebig-vurdering">
          <Badge label="Foreløbig – klinikken vurderer endeligt" tone="warning" />
          <Text style={styles.assessmentText}>{message.preliminaryAssessment}</Text>
        </View>
      ) : null}
      {message.outOfScopeTopics.map((topic) => (
        <StatusMessage key={topic} message={OUT_OF_SCOPE_NOTICES[topic]} />
      ))}
      {message.suggestedServices.length > 0 ? (
        <View style={styles.suggestions} testID="forslag">
          <Text style={styles.suggestionsTitle}>Kan passe til:</Text>
          <View style={styles.badges}>
            {message.suggestedServices.map((service) => (
              <Badge key={service.id} label={service.name} />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

// Én besked i samtalen. Patientens står til højre; AI'ens til venstre med evt. foreløbig vurdering og forslag. Teksten kan markeres, så patienten kan kopiere den.
export function ChatBubble({ message }: { message: AiChatMessageDto }) {
  const mine = message.role === "user";
  return (
    <View style={[styles.row, mine ? styles.rowMine : styles.rowTheirs]}>
      <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
        <Text selectable style={[styles.text, mine && styles.textMine]}>
          {message.content}
        </Text>
        {!mine ? <AssistantExtras message={message} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row" },
  rowMine: { justifyContent: "flex-end" },
  rowTheirs: { justifyContent: "flex-start" },
  bubble: { maxWidth: "88%", borderRadius: radius.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  mine: { backgroundColor: colors.brand600, borderBottomRightRadius: radius.sm },
  theirs: { backgroundColor: colors.surfaceMuted, borderBottomLeftRadius: radius.sm },
  text: { fontSize: fontSize.md, lineHeight: 22, color: colors.ink },
  textMine: { color: colors.onBrand },
  extras: { gap: spacing.md, marginTop: spacing.md },
  assessment: { gap: spacing.sm, backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
  assessmentText: { fontSize: fontSize.md, lineHeight: 22, color: colors.ink },
  suggestions: { gap: spacing.sm },
  suggestionsTitle: { fontSize: fontSize.sm, color: colors.inkMuted },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
});
