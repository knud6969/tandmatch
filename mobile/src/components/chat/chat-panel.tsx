import { useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type ScrollViewInstance } from "react-native";
import { AI_BOUNDARY_TEXT, CHAT_LIMIT_REACHED_TEXT, CHAT_PII_WARNING_TEXT, CHAT_WELCOME_TEXT } from "@/lib/constants/ai-texts";
import { CHAT_MAX_CHARS } from "@/lib/constants/limits";
import type { AiChatMessageDto } from "@/lib/types/ai";
import { ConsentGate } from "~/components/case/consent-gate";
import { LoadState, StatusMessage } from "~/components/ui";
import { colors, fontSize, MIN_TOUCH, radius, spacing } from "~/theme";
import { lowMessagesLeft, visibleQuickReplies } from "~/utils/case-cards";
import type { TurnOutcome } from "~/utils/chat-turn";
import { ChatBubble } from "./chat-bubble";

const WELCOME: AiChatMessageDto = {
  id: "velkommen",
  role: "assistant",
  content: CHAT_WELCOME_TEXT,
  preliminaryAssessment: null,
  suggestedServices: [],
  emergency: false,
  outOfScopeTopics: [],
  blocked: false,
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
  // Svar-kortene fra TandMatch, som vises under beskederne (architecture 7.9), og en nøgle, der ændres, når de ændrer sig.
  cards?: ReactNode;
  // Hurtigsvar vises kun, når intet svar-kort venter på patienten (chat-trinnet).
  quickRepliesAllowed?: boolean;
  cardsKey?: string;
};

// Samtalen med AI-assistenten (architecture 6.1, 7, 10.6). Fast tekst om AI'ens grænser og om personoplysninger, foreløbige
// vurderinger med mærkat og forslag til behandlinger. Inputfeltet står fast i bunden, over tastaturet.
export function ChatPanel(props: Props) {
  const { messages, pending } = props;
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const listRef = useRef<ScrollViewInstance>(null);

  useEffect(() => {
    const id = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(id);
  }, [messages.length, pending, props.cardsKey]);

  async function send(override?: string) {
    const text = (override ?? draft).trim();
    if (!text || sending) return;
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

  if (props.loading || props.error) {
    return (
      <View style={styles.pad}>
        <LoadState loading={props.loading} error={props.error} data={null} onRetry={props.onRetry}>
          {() => null}
        </LoadState>
      </View>
    );
  }

  const blockedByConsent = !props.aiConsentGiven;
  const finished = props.closed || props.messagesLeft === 0;
  const low = lowMessagesLeft(props.messagesLeft, finished);
  const quickReplies = visibleQuickReplies({
    messages,
    pending: pending !== null || sending,
    finished: finished || blockedByConsent,
    cardActive: !props.quickRepliesAllowed,
    typing: draft.trim() !== "",
  });

  return (
    <View style={styles.flex}>
      <ScrollView
        ref={listRef}
        style={styles.flex}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        accessibilityLabel="Samtale med AI-assistenten"
      >
        <View style={styles.boundary}>
          <Text style={styles.boundaryTitle}>{AI_BOUNDARY_TEXT}</Text>
          <Text style={styles.boundaryText} testID="pii-advarsel">
            {CHAT_PII_WARNING_TEXT}
          </Text>
        </View>
        <ChatBubble message={WELCOME} />
        {messages.map((message) => (
          <ChatBubble key={message.id} message={message} />
        ))}
        {pending ? (
          <>
            <View style={styles.pendingRow}>
              <View style={styles.pendingBubble}>
                <Text style={styles.pendingText}>{pending}</Text>
              </View>
            </View>
            <View style={styles.typing} accessibilityRole="progressbar" accessibilityLabel="AI-assistenten skriver">
              <ActivityIndicator color={colors.brand600} />
              <Text style={styles.muted}>AI-assistenten skriver …</Text>
            </View>
          </>
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
            <Text style={styles.hint}>{CHAT_PII_WARNING_TEXT}</Text>
            <View style={styles.inputRow}>
              <TextInput
                accessibilityLabel="Din besked til AI-assistenten"
                testID="chat-input"
                value={draft}
                onChangeText={setDraft}
                multiline
                maxLength={CHAT_MAX_CHARS}
                placeholder="Beskriv dit problem …"
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
                <Text style={styles.sendText}>Send</Text>
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
  list: { padding: spacing.lg, gap: spacing.md },
  boundary: { gap: spacing.xs, backgroundColor: colors.infoBg, borderColor: colors.infoLine, borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
  boundaryTitle: { fontSize: fontSize.sm, fontWeight: "700", color: colors.ink },
  boundaryText: { fontSize: fontSize.sm, color: colors.ink },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    minHeight: MIN_TOUCH,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.brand600,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  chipText: { fontSize: fontSize.md, fontWeight: "600", color: colors.brand700 },
  pendingRow: { flexDirection: "row", justifyContent: "flex-end" },
  pendingBubble: { maxWidth: "92%", backgroundColor: colors.brand600, borderRadius: radius.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  pendingText: { fontSize: fontSize.md, lineHeight: 22, color: colors.onBrand },
  typing: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  muted: { fontSize: fontSize.sm, color: colors.inkMuted },
  footer: { gap: spacing.sm, padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.surface },
  hint: { fontSize: 12, color: colors.inkMuted },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm },
  input: {
    flex: 1,
    minHeight: MIN_TOUCH,
    maxHeight: 112,
    borderWidth: 1,
    borderColor: colors.fieldBorder,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: fontSize.md,
    color: colors.ink,
    backgroundColor: colors.surface,
  },
  send: { minHeight: MIN_TOUCH, minWidth: 64, borderRadius: radius.md, backgroundColor: colors.brand600, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.lg },
  sendOff: { opacity: 0.5 },
  sendText: { color: colors.onBrand, fontSize: fontSize.md, fontWeight: "600" },
});
