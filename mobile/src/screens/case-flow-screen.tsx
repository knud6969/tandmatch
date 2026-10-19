import { useCallback, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { hasCurrentConsent } from "@/lib/domain/consents";
import { getCase } from "~/api/cases";
import { getConsents, grantConsent } from "~/api/consents";
import { ChatPanel } from "~/components/chat/chat-panel";
import { Button, LoadState, StatusMessage } from "~/components/ui";
import { useAction } from "~/hooks/use-action";
import { useChat } from "~/hooks/use-chat";
import { useLoad } from "~/hooks/use-load";
import { colors, fontSize, MIN_TOUCH, spacing } from "~/theme";

// Sagsflowet (architecture 6.1, 13.4). Foreløbig kun chatten (8.6a); resten af flowet designes af arkitekten.
// De færdige trinkomponenter fra 8.6b (behandlinger, tid og sted, opsummering) står i ~/components/case/ uden for navigationen.
export function CaseFlowScreen() {
  const { caseId } = useLocalSearchParams<{ caseId: string }>();
  const router = useRouter();
  const caseLoad = useLoad(useCallback(() => getCase(caseId), [caseId]), [caseId]);
  const consents = useLoad(getConsents);
  const [aiGranted, setAiGranted] = useState(false);
  const chat = useChat(caseId, caseLoad.reload);

  const grant = useAction(async () => {
    await grantConsent("ai_processing");
    setAiGranted(true);
    chat.clearNeedsConsent();
  });

  const leave = () => (router.canGoBack() ? router.back() : router.replace("/"));
  const dto = caseLoad.data;
  const aiConsent = aiGranted || (consents.data !== null && hasCurrentConsent(consents.data, "ai_processing"));

  let body;
  if (!dto || consents.loading) {
    body = (
      <ScrollView contentContainerStyle={styles.content}>
        <LoadState
          loading={caseLoad.loading || consents.loading}
          error={caseLoad.error ?? consents.error}
          data={null}
          onRetry={() => {
            caseLoad.reload();
            consents.reload();
          }}
        >
          {() => null}
        </LoadState>
      </ScrollView>
    );
  } else if (dto.status !== "draft") {
    const closed = dto.status === "closed";
    body = (
      <ScrollView contentContainerStyle={styles.content}>
        <StatusMessage
          message={
            closed
              ? "Sagen kan ikke ændres, fordi den er lukket. Du kan starte en ny samtale, hvis du har brug for hjælp igen."
              : "Sagen kan ikke ændres, fordi den allerede er sendt. Du kan følge den under Mine sager."
          }
        />
        <Button label={closed ? "Start en ny samtale" : "Gå til Mine sager"} onPress={() => (closed ? router.replace("/start") : router.replace("/sager"))} />
      </ScrollView>
    );
  } else {
    body = (
      <ChatPanel
        loading={chat.loading}
        error={chat.error}
        onRetry={chat.reload}
        messages={chat.messages}
        pending={chat.pending}
        closed={chat.closed}
        messagesLeft={chat.messagesLeft}
        aiConsentGiven={aiConsent && !chat.needsConsent}
        consentPending={grant.pending}
        consentError={grant.error}
        onGrantConsent={() => void grant.run()}
        onSend={chat.send}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="Forlad samtalen" onPress={leave} style={styles.close} hitSlop={8}>
            <Text style={styles.closeText}>‹ Luk</Text>
          </Pressable>
          <Text accessibilityRole="header" style={styles.title}>
            Beskriv dit problem
          </Text>
        </View>
        {body}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  flex: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.line },
  close: { minHeight: MIN_TOUCH, minWidth: MIN_TOUCH, justifyContent: "center" },
  closeText: { fontSize: fontSize.md, fontWeight: "600", color: colors.brand700 },
  title: { fontSize: fontSize.lg, fontWeight: "700", color: colors.ink },
  content: { padding: spacing.lg, gap: spacing.lg, flexGrow: 1 },
});
