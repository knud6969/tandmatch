import { useCallback, useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type ScrollViewInstance } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { MESSAGE_MAX_CHARS } from "@/lib/common/constants/limits";
import { MESSAGE_POLL_INTERVAL_MS } from "@/lib/leads/constants/messages";
import { isThreadOpen } from "@/lib/leads/domain/leads";
import type { PatientLeadDto } from "@/lib/leads/types/leads";
import type { MessageDto } from "@/lib/leads/types/messages";
import { ApiRequestError } from "~/api/client";
import { listCaseLeads } from "~/api/leads";
import { listMessages, sendMessage } from "~/api/messages";
import { MessageBubble } from "~/components/messages/message-bubble";
import { LoadState, StatusMessage } from "~/components/ui";
import { useFocusPolling } from "~/hooks/use-polling";
import { colors, fontSize, iconSize, MIN_TOUCH, radius, SEND_BUTTON, spacing, type } from "~/theme";
import { appendMessage, messagesChanged, sortMessages, THREAD_CLOSED_NOTICE } from "~/utils/message-view";

type View_ = { messages: MessageDto[]; lead: PatientLeadDto };

const GENERIC_ERROR = "Der opstod en fejl. Prøv igen om lidt.";
const errorText = (e: unknown) => (e instanceof ApiRequestError ? e.message : GENERIC_ERROR);

// Beskedtråden med én klinik (architecture 10.12, 13.4). Hentes ved fokus og derefter hvert 15. sekund, men kun mens skærmen er i fokus.
// Klinikken laver den endelige vurdering; tråden er til afklarende spørgsmål, ikke til akutte problemer.
export function MessagesScreen() {
  const router = useRouter();
  const { caseId, leadId } = useLocalSearchParams<{ caseId: string; leadId: string }>();
  const [view, setView] = useState<View_ | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const listRef = useRef<ScrollViewInstance>(null);
  // Refs i stedet for state, så hentninger og afsendelse ikke læser forældede værdier: om der er data at vise, om en hentning
  // er i gang, om en besked er på vej, og de beskeder, patienten selv har sendt (flettes ind i hver hentning, så en hentning
  // startet før afsendelsen ikke fjerner den sendte besked).
  const hasData = useRef(false);
  const inFlight = useRef(false);
  const sendingRef = useRef(false);
  const sent = useRef<MessageDto[]>([]);

  // Henter tråden og leadet (til klinikkens navn og om tråden er åben). Overlappende hentninger springes over, medmindre `force`.
  // Fejler hentningen, bevares det viste, og der vises kun en advarsel; uden data vises fejlen i stedet.
  const fetchView = useCallback(
    async (force = false) => {
      if (inFlight.current && !force) return;
      inFlight.current = true;
      try {
        const [messages, leads] = await Promise.all([listMessages(leadId), listCaseLeads(caseId)]);
        const lead = leads.find((l) => l.id === leadId);
        if (!lead) throw new Error("not-found");
        setView({ messages: sent.current.reduce(appendMessage, sortMessages(messages)), lead });
        hasData.current = true;
        setLoadError(null);
        setPollError(null);
      } catch (e) {
        const text = e instanceof Error && e.message === "not-found" ? "Henvendelsen findes ikke på denne sag." : errorText(e);
        if (hasData.current) setPollError(text);
        else setLoadError(text);
      } finally {
        inFlight.current = false;
      }
    },
    [caseId, leadId],
  );

  useFocusEffect(
    useCallback(() => {
      void fetchView();
    }, [fetchView]),
  );
  useFocusPolling(() => fetchView(), MESSAGE_POLL_INTERVAL_MS);

  // Ruller kun ned, når der er kommet nye beskeder, så patienten ikke mister sin plads ved hver polling.
  const previous = useRef<MessageDto[]>([]);
  useEffect(() => {
    if (!view) return;
    if (messagesChanged(previous.current, view.messages)) {
      previous.current = view.messages;
      const id = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
      return () => clearTimeout(id);
    }
  }, [view]);

  async function send() {
    const body = draft.trim();
    if (!body || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setSendError(null);
    try {
      const created = await sendMessage(leadId, { body });
      setDraft("");
      sent.current = appendMessage(sent.current, created);
      setView((v) => (v ? { ...v, messages: appendMessage(v.messages, created) } : v));
    } catch (e) {
      // Beskeden er ikke sendt: den bliver stående i feltet. MESSAGE_LIMIT og THREAD_CLOSED har egne danske tekster.
      setSendError(errorText(e));
      if (e instanceof ApiRequestError && e.code === "THREAD_CLOSED") void fetchView(true);
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  const leave = () => (router.canGoBack() ? router.back() : router.replace({ pathname: "/sag/[caseId]", params: { caseId } }));
  const writable = view ? isThreadOpen(view.lead.status) && !view.lead.clinic.removed : false;
  const empty = draft.trim() === "";

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.header}>
          <Pressable accessibilityRole="link" accessibilityLabel="Tilbage til sagen" onPress={leave} style={styles.close} hitSlop={8}>
            <Text style={styles.closeText}>← Sagen</Text>
          </Pressable>
          <Text accessibilityRole="header" style={styles.title} numberOfLines={1}>
            {view ? view.lead.clinic.name : "Beskeder"}
          </Text>
          <View style={styles.close} />
        </View>
        <LoadState loading={view === null && loadError === null} error={loadError} data={view} onRetry={() => void fetchView(true)}>
          {(data) => (
            <>
              <ScrollView ref={listRef} style={styles.flex} contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" accessibilityLabel="Beskeder med klinikken">
                {data.messages.length === 0 ? <Text style={styles.muted}>Ingen beskeder endnu.</Text> : null}
                {data.messages.map((m) => (
                  <MessageBubble key={m.id} message={m} />
                ))}
                {pollError ? <StatusMessage message={`Beskederne kunne ikke opdateres lige nu. ${pollError}`} tone="warning" /> : null}
              </ScrollView>
              <View style={styles.footer}>
                {writable ? (
                  <>
                    {sendError ? <StatusMessage message={sendError} tone="danger" /> : null}
                    <Text style={styles.hint}>Akut? Ring 112.</Text>
                    <Pressable accessibilityRole="link" onPress={() => router.push("/akut")} style={styles.link}>
                      <Text style={styles.linkText}>Har du ondt? Find en akuttid</Text>
                    </Pressable>
                    <View style={styles.inputRow}>
                      <TextInput
                        accessibilityLabel="Din besked til klinikken"
                        value={draft}
                        onChangeText={setDraft}
                        multiline
                        maxLength={MESSAGE_MAX_CHARS}
                        placeholder="Skriv en besked …"
                        placeholderTextColor={colors.inkMuted}
                        style={styles.input}
                      />
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Send besked"
                        accessibilityState={{ disabled: sending || empty, busy: sending }}
                        disabled={sending || empty}
                        onPress={() => void send()}
                        style={[styles.send, (sending || empty) && styles.sendOff]}
                      >
                        <Ionicons name="arrow-up" size={iconSize.md} color={colors.onBrand} />
                      </Pressable>
                    </View>
                  </>
                ) : (
                  <StatusMessage message={THREAD_CLOSED_NOTICE} />
                )}
              </View>
            </>
          )}
        </LoadState>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  flex: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm, paddingHorizontal: spacing.lg },
  close: { minHeight: MIN_TOUCH, minWidth: 72, justifyContent: "center" },
  closeText: { fontSize: fontSize.md, fontWeight: "600", color: colors.brand700 },
  title: { ...type.heading, flexShrink: 1 },
  list: { padding: spacing.lg, gap: spacing.md, flexGrow: 1 },
  muted: type.body,
  footer: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.surface },
  hint: { fontSize: fontSize.xs, lineHeight: 16, color: colors.inkMuted },
  link: { minHeight: MIN_TOUCH, justifyContent: "center" },
  linkText: { fontSize: fontSize.sm, fontWeight: "600", color: colors.brand700, textDecorationLine: "underline" },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm },
  input: {
    flex: 1,
    minHeight: MIN_TOUCH,
    maxHeight: 112,
    borderWidth: 1,
    borderColor: colors.fieldBorder,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    fontSize: fontSize.md,
    color: colors.ink,
    backgroundColor: colors.surface,
  },
  send: { width: SEND_BUTTON, height: SEND_BUTTON, borderRadius: SEND_BUTTON / 2, backgroundColor: colors.brand600, alignItems: "center", justifyContent: "center" },
  sendOff: { opacity: 0.4 },
});
