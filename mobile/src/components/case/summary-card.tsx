import { useEffect, useState } from "react";
import { ActivityIndicator, Image, StyleSheet, Text, TextInput, View } from "react-native";
import { CASE_FLOW_TEXTS } from "@/lib/constants/case-flow";
import { CHAT_NOT_SHARED_TEXT, DESCRIPTION_LABEL, IMAGE_QUALITY_LABELS, OUT_OF_SCOPE_NOTICES } from "@/lib/constants/ai-texts";
import { SUMMARY_MAX_CHARS } from "@/lib/constants/limits";
import type { CaseDto } from "@/lib/types/cases";
import { Badge, Button, StatusMessage } from "~/components/ui";
import { useAction } from "~/hooks/use-action";
import type { CaseActions } from "~/hooks/use-case-actions";
import { shouldAutoGenerate, type SummaryAttempt } from "~/utils/case-cards";
import { colors, fontSize, MIN_TOUCH, radius, spacing } from "~/theme";
import { FlowCard, FoldedCard } from "./flow-card";

type Props = { caseDto: CaseDto; answered: boolean; actions: CaseActions; onSaved: () => void };

// Opsummeringskortet (architecture 7.9). Udkastet laves automatisk én gang; patienten godkender selv med "Det passer" eller
// "Gem og godkend". Godkendelsen sker aldrig automatisk. Ved fejl eller loft skriver patienten selv.
export function SummaryCard({ caseDto, answered, actions, onSaved }: Props) {
  const existing = caseDto.summaryText ?? caseDto.aiSummary?.summaryText ?? "";
  const [text, setText] = useState(existing);
  const [editing, setEditing] = useState(false);
  const [attempt, setAttempt] = useState<SummaryAttempt | null>(null);
  const [generating, setGenerating] = useState(false);
  const [attempted, setAttempted] = useState(false);

  // Udkast fra AI'en. Ved fejl eller loft åbnes feltet, så patienten selv kan skrive.
  async function generate() {
    setAttempted(true);
    setGenerating(true);
    const result = await actions.generateSummary();
    setAttempt(result);
    if (result.kind === "draft") {
      setText(result.text);
      setEditing(false);
      onSaved();
    } else {
      setEditing(true);
    }
    setGenerating(false);
  }

  // Udkast laves automatisk højst én gang; godkendelsen sker aldrig automatisk.
  const autoGenerate = !answered && shouldAutoGenerate({ hasDraft: caseDto.aiSummary !== null, hasText: caseDto.summaryText !== null, attempted });
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (autoGenerate) void generate();
    // Kun ved første gang kortet bliver aktuelt uden udkast; `attempted` forhindrer en løkke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoGenerate]);

  const approve = useAction(async (value: string) => {
    await actions.approveSummary(value);
    setEditing(false);
    onSaved();
  });

  if (answered && !editing) {
    return <FoldedCard testID="kort-opsummering-besvaret" label="Beskrivelse til klinikken" value={caseDto.summaryText ?? ""} onEdit={() => { setText(caseDto.summaryText ?? ""); setEditing(true); }} />;
  }

  const trimmed = text.trim();
  const writeYourself = attempt?.kind === "write_yourself";
  const showField = editing;
  // Er billeder tilføjet efter en gemt tekst, skal patienten kigge teksten igennem igen, før den godkendes.
  const imagesChanged = caseDto.summaryApprovedAt === null && caseDto.summaryText !== null && caseDto.images.length > 0;
  const noMoreDrafts = attempt?.generationsLeft === 0;
  // Billedbeskrivelser er AI'ens foreløbige og mærkes som sådan; klinikken ser selv billederne.
  const described = caseDto.images.filter((image) => image.description);

  return (
    <FlowCard title="Din beskrivelse til klinikken" testID="kort-opsummering">
      {imagesChanged ? <StatusMessage message={CASE_FLOW_TEXTS.imagesChanged} tone="warning" /> : null}

      {generating ? (
        <View style={styles.loading} accessibilityRole="progressbar" accessibilityLabel="Laver et udkast">
          <ActivityIndicator color={colors.brand600} />
          <Text style={styles.muted}>Laver et udkast ud fra det, du har skrevet …</Text>
        </View>
      ) : null}

      {!generating && !showField && trimmed !== "" ? (
        <Text selectable style={styles.summary} testID="opsummering-tekst">
          {text}
        </Text>
      ) : null}

      {!generating && showField ? (
        <View style={styles.field}>
          {writeYourself ? (
            <Text accessibilityRole="header" style={styles.label}>
              {CASE_FLOW_TEXTS.summaryWriteYourself}
            </Text>
          ) : null}
          <TextInput
            accessibilityLabel={writeYourself ? CASE_FLOW_TEXTS.summaryWriteYourself : "Beskrivelse til klinikken"}
            testID="opsummering-input"
            value={text}
            onChangeText={setText}
            multiline
            maxLength={SUMMARY_MAX_CHARS}
            textAlignVertical="top"
            style={styles.input}
          />
          <Text style={styles.muted}>
            {text.length} af {SUMMARY_MAX_CHARS} tegn.
          </Text>
        </View>
      ) : null}

      {attempt?.kind === "write_yourself" && attempt.message ? <StatusMessage message={attempt.message} tone="warning" /> : null}
      {attempt?.kind === "write_yourself" && !attempt.message ? (
        <StatusMessage message="Vi kunne ikke lave et udkast. Skriv selv kort, hvad klinikken skal vide." />
      ) : null}
      {attempt?.outOfScopeNotice ? Object.values(OUT_OF_SCOPE_NOTICES).map((line) => <StatusMessage key={line} message={line} />) : null}

      {attempt && attempt.retake.length > 0 ? (
        <StatusMessage
          tone="warning"
          message={`Nogle billeder kan være svære at bruge: ${attempt.retake.map((item) => IMAGE_QUALITY_LABELS[item.reason].toLowerCase()).join(", ")}. Du kan tage nye billeder, men det er ikke et krav.`}
        />
      ) : null}

      {described.length > 0 && !generating ? (
        <View style={styles.images} testID="billedbeskrivelser">
          {described.map((image, index) => (
            <View key={image.id} style={styles.imageRow}>
              <Image source={{ uri: image.url }} accessibilityLabel={`Dit billede ${index + 1}`} style={styles.thumb} />
              <View style={styles.imageText}>
                <Badge label={DESCRIPTION_LABEL} />
                <Text style={styles.imageDescription}>{image.description}</Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      <Text style={styles.clinicSees}>{CASE_FLOW_TEXTS.summaryClinicSees}</Text>
      <Text style={styles.muted}>{CHAT_NOT_SHARED_TEXT}</Text>
      {attempt && attempt.generationsLeft !== null && !showField ? <Text style={styles.muted}>Du kan lave {attempt.generationsLeft} nye udkast.</Text> : null}

      {approve.error ? <StatusMessage message={approve.error} tone="danger" /> : null}

      {!generating && showField ? (
        <Button label={CASE_FLOW_TEXTS.summarySaveAndApprove} disabled={trimmed === ""} loading={approve.pending} onPress={() => void approve.run(trimmed)} />
      ) : null}
      {!generating && !showField && trimmed !== "" ? (
        <>
          <Button label={CASE_FLOW_TEXTS.summaryApprove} loading={approve.pending} onPress={() => void approve.run(trimmed)} />
          <Button label={CASE_FLOW_TEXTS.summaryEdit} variant="secondary" onPress={() => setEditing(true)} />
        </>
      ) : null}
      {!generating && !answered && !noMoreDrafts && (trimmed !== "" || attempt !== null) ? (
        <Button label={CASE_FLOW_TEXTS.summaryRegenerate} variant="secondary" onPress={() => void generate()} />
      ) : null}
    </FlowCard>
  );
}

const styles = StyleSheet.create({
  loading: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  muted: { fontSize: fontSize.sm, color: colors.inkMuted },
  summary: { fontSize: fontSize.md, lineHeight: 24, color: colors.ink, backgroundColor: colors.surfaceMuted, borderRadius: radius.md, padding: spacing.md },
  clinicSees: { fontSize: fontSize.sm, fontWeight: "700", color: colors.brand800 },
  field: { gap: spacing.sm },
  label: { fontSize: fontSize.md, fontWeight: "600", color: colors.ink },
  input: {
    minHeight: MIN_TOUCH * 3,
    borderWidth: 1,
    borderColor: colors.fieldBorder,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: fontSize.md,
    lineHeight: 22,
    color: colors.ink,
    backgroundColor: colors.surface,
  },
  images: { gap: spacing.md },
  imageRow: { flexDirection: "row", gap: spacing.md },
  thumb: { width: 64, height: 64, borderRadius: radius.sm, backgroundColor: colors.surfaceMuted },
  imageText: { flex: 1, gap: spacing.xs },
  imageDescription: { fontSize: fontSize.sm, lineHeight: 20, color: colors.ink },
});
