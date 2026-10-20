import { StyleSheet, Text, View } from "react-native";
import { OUT_OF_SCOPE_NOTICES, PRELIMINARY_ASSESSMENT_LABEL } from "@/lib/constants/ai-texts";
import type { AiChatMessageDto } from "@/lib/types/ai";
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
          <Text style={styles.assessmentLabel}>{PRELIMINARY_ASSESSMENT_LABEL}</Text>
        </View>
      ) : null}
      {message.outOfScopeTopics.map((topic) => (
        <StatusMessage key={topic} message={OUT_OF_SCOPE_NOTICES[topic]} />
      ))}
      {message.suggestedServices.length > 0 ? (
        <View style={styles.suggestions} testID="forslag">
          <Text style={styles.suggestionsTitle}>Behandlinger, din beskrivelse kan passe til. Du bekræfter selv nedenfor:</Text>
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
  bubble: { maxWidth: "92%", borderRadius: radius.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  mine: { backgroundColor: colors.brand600 },
  theirs: { backgroundColor: colors.surfaceMuted },
  text: { fontSize: fontSize.md, lineHeight: 22, color: colors.ink },
  textMine: { color: colors.onBrand },
  extras: { gap: spacing.md, marginTop: spacing.md },
  assessment: { gap: spacing.sm, backgroundColor: colors.warningBg, borderColor: colors.warningLine, borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
  assessmentText: { fontSize: fontSize.md, lineHeight: 22, color: colors.warningInk },
  assessmentLabel: { fontSize: fontSize.sm, color: colors.warningInk },
  suggestions: { gap: spacing.sm },
  suggestionsTitle: { fontSize: fontSize.sm, fontWeight: "600", color: colors.ink },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
});
