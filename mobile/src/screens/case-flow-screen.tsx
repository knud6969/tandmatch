import { useCallback, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { hasCurrentConsent } from "@/lib/domain/consents";
import type { CaseDto } from "@/lib/types/cases";
import { getCase } from "~/api/cases";
import { getConsents, grantConsent } from "~/api/consents";
import { getServiceGroups } from "~/api/services";
import { useSession } from "~/auth/session-context";
import { ChatPanel } from "~/components/chat/chat-panel";
import { PostalCodeCard } from "~/components/case/postal-code-card";
import { ReadyCard } from "~/components/case/ready-card";
import { ServicesCard } from "~/components/case/services-card";
import { SummaryCard } from "~/components/case/summary-card";
import { TimeframeCard } from "~/components/case/timeframe-card";
import { Button, LoadState, StatusMessage } from "~/components/ui";
import { useAction } from "~/hooks/use-action";
import { useCaseActions } from "~/hooks/use-case-actions";
import { useChat } from "~/hooks/use-chat";
import { useLoad } from "~/hooks/use-load";
import { colors, fontSize, MIN_TOUCH, spacing } from "~/theme";
import { cardModes, flowStepForApp } from "~/utils/case-cards";

// Sagsflowet som én samtale (architecture 7.9, 13.4): chatten med AI'en og under den faste svar-kort fra TandMatch
// (behandlinger, tidsrum, postnummer, opsummering, klar). Hvilket kort der er aktuelt, afgøres af nextCaseFlowStep().
export function CaseFlowScreen() {
  const { caseId } = useLocalSearchParams<{ caseId: string }>();
  const router = useRouter();
  const caseLoad = useLoad(useCallback(() => getCase(caseId), [caseId]), [caseId]);
  const consents = useLoad(getConsents);
  const [aiGranted, setAiGranted] = useState(false);
  const chat = useChat(caseId, caseLoad.reload);
  const actions = useCaseActions(caseId);
  const catalog = useLoad(getServiceGroups);
  const session = useSession();
  const hasAccount = session.me !== null && !session.me.isAnonymous;

  // AI-samtykket gives i chatten, første gang det mangler (architecture 10.2); chatten låses op uden at hente samtykkerne igen.
  const grant = useAction(async () => {
    await grantConsent("ai_processing");
    setAiGranted(true);
    chat.clearNeedsConsent();
  });

  const leave = () => (router.canGoBack() ? router.back() : router.replace("/"));
  const dto = caseLoad.data;
  const changed = caseLoad.reload;

  // Chatten og kortene bruger samme trin, så de aldrig er uenige om, hvad der er aktuelt.
  function stepOf(d: CaseDto) {
    return flowStepForApp(d, { messages: chat.messages, status: chat.closed ? "closed" : "active", readyForSummary: chat.ready });
  }

  function renderCards() {
    if (!dto) return null;
    const step = stepOf(dto);
    const modes = cardModes(step);
    const answered = (id: keyof typeof modes) => modes[id] === "answered";
    return (
      <View style={styles.cards}>
        {caseLoad.error ? <StatusMessage message={caseLoad.error} tone="danger" /> : null}
        {modes.services !== "hidden" ? (
          <ServicesCard
            // Ny key ved nye forslag, så kortets lokale valg nulstilles til AI'ens seneste forslag.
            key={dto.suggestedServices.map((s) => s.id).join(",")}
            caseDto={dto}
            answered={answered("services")}
            actions={actions}
            catalog={{ groups: catalog.data, loading: catalog.loading, error: catalog.error, reload: catalog.reload }}
            onSaved={changed}
          />
        ) : null}
        {modes.timeframe !== "hidden" ? <TimeframeCard caseDto={dto} answered={answered("timeframe")} actions={actions} onSaved={changed} /> : null}
        {modes.postal_code !== "hidden" ? (
          <PostalCodeCard caseDto={dto} answered={answered("postal_code")} hasAccount={hasAccount} actions={actions} onSaved={changed} />
        ) : null}
        {modes.summary !== "hidden" ? <SummaryCard caseDto={dto} answered={answered("summary")} actions={actions} onSaved={changed} /> : null}
        {modes.ready !== "hidden" ? (
          <ReadyCard
            canSend={dto.canSend}
            onSeeClinics={() => router.push({ pathname: "/klinikker", params: { sag: caseId } })}
            onOpenCases={() => router.replace("/sager")}
          />
        ) : null}
      </View>
    );
  }

  // Samtykket gælder enten fra serveren eller fra det, der netop er givet; serveren kan dog stadig afvise (needsConsent).
  const aiConsent = aiGranted || (consents.data !== null && hasCurrentConsent(consents.data, "ai_processing"));

  const cards = dto && dto.status === "draft" ? renderCards() : null;
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
        quickRepliesAllowed={stepOf(dto) === "chat"}
        cards={cards}
        cardsKey={cardsKey(dto)}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      {/* iOS: padding løfter inputfeltet over tastaturet; Android håndterer det selv. */}
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

// Ændres, når kortene skifter, så chatten ruller ned til det nye kort.
function cardsKey(dto: CaseDto | null): string {
  if (!dto) return "";
  return [dto.services.length, dto.preferredTimeframe, dto.postalCode, dto.summaryApprovedAt, dto.aiSummary ? 1 : 0].join("|");
}

const styles = StyleSheet.create({
  cards: { gap: spacing.md },
  safe: { flex: 1, backgroundColor: colors.canvas },
  flex: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.line },
  close: { minHeight: MIN_TOUCH, minWidth: MIN_TOUCH, justifyContent: "center" },
  closeText: { fontSize: fontSize.md, fontWeight: "600", color: colors.brand700 },
  title: { fontSize: fontSize.lg, fontWeight: "700", color: colors.ink },
  content: { padding: spacing.lg, gap: spacing.lg, flexGrow: 1 },
});
