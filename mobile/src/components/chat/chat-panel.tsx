import { useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type ScrollViewInstance } from "react-native";
import { CHAT_LIMIT_REACHED_TEXT, CHAT_PII_WARNING_TEXT, CHAT_WELCOME_TEXT } from "@/lib/cases/constants/ai-texts";
import { CHAT_MAX_CHARS } from "@/lib/common/constants/limits";
import type { AiChatMessageDto } from "@/lib/cases/types/ai";
import { Ionicons } from "@expo/vector-icons";
import { ConsentGate } from "~/components/case/consent-gate";
import { Button, LoadState, StatusMessage } from "~/components/ui";
import { colors, fontSize, iconSize, MIN_TOUCH, radius, SEND_BUTTON, spacing } from "~/theme";
import { lowMessagesLeft, visibleQuickReplies } from "~/utils/case-cards";
import type { TurnOutcome } from "~/utils/chat-turn";
import type { useChatImages } from "~/hooks/use-chat-images";
import { buildTimeline } from "~/utils/chat-timeline";
import { ChatBubble } from "./chat-bubble";
import { ImageBubble } from "./image-bubble";

// Velkomstbesked vises lokalt og gemmes ikke, så den ikke tæller med i beskedgrænsen.
const WELCOME: AiChatMessageDto = {
  id: "velkommen",
  role: "assistant",
  content: CHAT_WELCOME_TEXT,
  preliminaryAssessment: null,
  suggestedServices: [],
  emergency: false,
  outOfScopeTopics: [],
  blocked: false,
  quickReplies: [],
  createdAt: "",
};

type Props = {
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  messages: AiChatMessageDto[];
  pending: string | null;
  closed: boolean;
  messagesLeft: number;
  aiConsentGiven: boolean;
  consentPending: boolean;
  consentError: string | null;
  onGrantConsent: () => void;
  onSend: (text: string) => Promise<TurnOutcome>;
  // Billedturen (7.9c): AI'en reagerer selv efter en upload-batch.
  imageTurning?: boolean;
  imageNotice?: { message: string; retry: boolean } | null;
  onRetryImageTurn?: () => void;
  // Svar-kortene fra TandMatch, som vises under beskederne (architecture 7.9), og en nøgle, der ændres, når de ændrer sig.
  cards?: ReactNode;
  cardsKey?: string;
  // Billeder i chatten (architecture 9.3); udeladt, hvis sagen ikke kan tage billeder.
  images?: ReturnType<typeof useChatImages>;
};

// Samtalen med AI-assistenten (architecture 6.1, 7, 10.6). Fast tekst om AI'ens grænser og om personoplysninger, foreløbige
// vurderinger med mærkat og forslag til behandlinger. Inputfeltet står fast i bunden, over tastaturet.
export function ChatPanel(props: Props) {
  const { messages, pending } = props;
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const listRef = useRef<ScrollViewInstance>(null);

  // Ruller ned til det nyeste efter en kort pause, så layoutet (nye beskeder og kort) når at blive målt først.
  useEffect(() => {
    const id = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(id);
  }, [messages.length, pending, props.imageTurning, props.cardsKey, props.images?.items.length]);

  async function send(override?: string) {
    const text = (override ?? draft).trim();
    if (!text || sending || props.imageTurning) return;
    setSending(true);
    setSendError(null);
    if (override === undefined) setDraft("");
    const outcome = await props.onSend(text);
    setSending(false);
    // Beskeden er ikke gemt: læg den tilbage, så patienten kan prøve igen uden at skrive forfra.
    if (outcome.kind === "failed") {
      if (override === undefined) setDraft(text);
      setSendError(outcome.message);
    } else if (outcome.kind === "consent_required") {
      if (override === undefined) setDraft(text);
    }
  }

  // Ingen samtale vises, før den er hentet, så patienten ikke ser en tom chat, der så pludselig fyldes.
  if (props.loading || props.error) {
    return (
      <View style={styles.pad}>
        <LoadState loading={props.loading} error={props.error} data={null} onRetry={props.onRetry}>
          {() => null}
        </LoadState>
      </View>
    );
  }

  // Uden AI-samtykke vises samtykkekortet i stedet for inputfeltet (architecture 10.2); intet sendes til AI'en før da.
  const blockedByConsent = !props.aiConsentGiven;
  const finished = props.closed || props.messagesLeft === 0;
  const low = lowMessagesLeft(props.messagesLeft, finished);
  const quickReplies = visibleQuickReplies({
    messages,
    pending: pending !== null || sending || props.imageTurning === true,
    finished: finished || blockedByConsent,
    typing: draft.trim() !== "",
  });

  return (
    <View style={styles.flex}>
      <ScrollView
        ref={listRef}
        style={styles.flex}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        // "interactive" lader patienten trække tastaturet ned (iOS) uden at miste placeringen i samtalen.
        keyboardDismissMode="interactive"
        accessibilityLabel="Samtale med AI-assistenten"
      >
        <ChatBubble message={WELCOME} />
        {buildTimeline(messages, props.images?.items ?? []).map((entry) =>
          entry.kind === "message" ? (
            <ChatBubble key={entry.key} message={entry.message} />
          ) : (
            <ImageBubble
              key={entry.key}
              item={entry.item}
              index={entry.index}
              onDelete={() => props.images?.remove(entry.item)}
              onRetry={() => props.images?.retry(entry.item.key)}
            />
          ),
        )}
        {/* Patientens besked vises med det samme, mens svaret hentes, så det føles hurtigt. */}
        {pending ? (
          <>
            <View style={styles.pendingRow}>
              <View style={styles.pendingBubble}>
                <Text style={styles.pendingText}>{pending}</Text>
              </View>
            </View>
            <View style={styles.typing} accessibilityRole="progressbar" accessibilityLabel="AI-assistenten skriver">
              <ActivityIndicator color={colors.inkMuted} size="small" />
              <Text style={styles.muted}>AI-assistenten skriver …</Text>
            </View>
          </>
        ) : null}
        {props.imageTurning ? (
          <View style={styles.typing} accessibilityRole="progressbar" accessibilityLabel="AI-assistenten skriver">
            <ActivityIndicator color={colors.inkMuted} size="small" />
            <Text style={styles.muted}>AI-assistenten skriver …</Text>
          </View>
        ) : null}
        {props.imageNotice && !props.imageTurning ? (
          <View style={styles.imageNotice}>
            <StatusMessage message={props.imageNotice.message} tone="warning" />
            {props.imageNotice.retry && props.onRetryImageTurn ? <Button label="Prøv igen" variant="text" onPress={props.onRetryImageTurn} /> : null}
          </View>
        ) : null}
        {quickReplies.length > 0 ? (
          <View style={styles.chips} accessibilityLabel="Svarforslag">
            {quickReplies.map((reply) => (
              <Pressable
                key={reply}
                accessibilityRole="button"
                accessibilityLabel={`Svar: ${reply}`}
                onPress={() => void send(reply)}
                style={styles.chip}
              >
                <Text style={styles.chipText}>{reply}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        {props.cards}
      </ScrollView>

      {/* Fast bund: inputfeltet er altid til at nå med tommelfingeren, og kortene ruller i listen over det. */}
      <View style={styles.footer}>
        {blockedByConsent ? (
          <ConsentGate type="ai_processing" onGrant={props.onGrantConsent} pending={props.consentPending} error={props.consentError} />
        ) : finished ? (
          <StatusMessage message={CHAT_LIMIT_REACHED_TEXT} />
        ) : (
          <>
            {sendError ? <StatusMessage message={sendError} tone="danger" /> : null}
            {low !== null ? (
              <StatusMessage message={low === 1 ? "Du har 1 besked tilbage" : `Du har ${low} beskeder tilbage`} tone="warning" />
            ) : null}
            {props.images?.notice ? <StatusMessage message={props.images.notice} tone="warning" /> : null}
            {/* Advarslen om personoplysninger vises kun, før patienten er begyndt at skrive, og ikke mens et samtykke er åbent. */}
            {messages.length === 0 && !pending && !props.images?.awaitingConsent ? (
              <Text style={styles.hint} testID="pii-advarsel">
                {CHAT_PII_WARNING_TEXT}
              </Text>
            ) : null}
            {props.images?.awaitingConsent ? (
              <View style={styles.consent}>
                <ConsentGate
                  type="image_upload"
                  onGrant={() => void props.images?.grantConsent()}
                  pending={props.images.consentPending}
                  error={props.images.consentError}
                  actionLabel="Giv samtykke"
                />
                <Button label="Ikke nu" variant="text" onPress={props.images.declineConsent} />
              </View>
            ) : null}
            <View style={styles.inputRow}>
              {props.images ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Tilføj billede"
                  accessibilityState={{ disabled: !props.images.canAdd }}
                  disabled={!props.images.canAdd}
                  onPress={props.images.chooseSource}
                  style={[styles.attach, !props.images.canAdd && styles.sendOff]}
                >
                  <Ionicons name="camera-outline" size={iconSize.md} color={colors.brand700} />
                </Pressable>
              ) : null}
              <TextInput
                accessibilityLabel="Din besked til AI-assistenten"
                testID="chat-input"
                value={draft}
                onChangeText={setDraft}
                multiline
                maxLength={CHAT_MAX_CHARS}
                placeholder={messages.length === 0 ? "Beskriv dit problem …" : "Skriv dit svar …"}
                placeholderTextColor={colors.inkMuted}
                style={styles.input}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Send besked"
                accessibilityState={{ disabled: sending || draft.trim() === "" }}
                disabled={sending || draft.trim() === ""}
                onPress={() => void send()}
                style={[styles.send, (sending || draft.trim() === "") && styles.sendOff]}
              >
                <Ionicons name="arrow-up" size={iconSize.md} color={colors.onBrand} />
              </Pressable>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pad: { padding: spacing.lg },
  list: { padding: spacing.lg, gap: spacing.lg },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    minHeight: MIN_TOUCH,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
  },
  chipText: { fontSize: fontSize.sm, fontWeight: "500", color: colors.brand700 },
  pendingRow: { flexDirection: "row", justifyContent: "flex-end" },
  pendingBubble: { maxWidth: "88%", backgroundColor: colors.brand600, borderRadius: radius.lg, borderBottomRightRadius: radius.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  pendingText: { fontSize: fontSize.md, lineHeight: 22, color: colors.onBrand },
  imageNotice: { gap: spacing.xs },
  typing: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  muted: { fontSize: fontSize.sm, color: colors.inkMuted },
  footer: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.surface },
  hint: { fontSize: fontSize.xs, lineHeight: 16, color: colors.inkMuted },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm },
  input: {
    flex: 1,
    minHeight: MIN_TOUCH,
    maxHeight: 112,
    borderWidth: 1,
    borderColor: colors.fieldBorder,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: fontSize.md,
    color: colors.ink,
    backgroundColor: colors.surface,
  },
  send: { width: SEND_BUTTON, height: SEND_BUTTON, borderRadius: SEND_BUTTON / 2, backgroundColor: colors.brand600, alignItems: "center", justifyContent: "center" },
  sendOff: { opacity: 0.4 },
  attach: { width: SEND_BUTTON, height: SEND_BUTTON, borderRadius: SEND_BUTTON / 2, borderWidth: 1, borderColor: colors.fieldBorder, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  consent: { maxHeight: 360 },
});
