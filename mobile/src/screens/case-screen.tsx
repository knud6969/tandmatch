import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { closeCase, getCase } from "~/api/cases";
import { listCaseLeads, withdrawLead } from "~/api/leads";
import { LeadRow } from "~/components/case/lead-row";
import { BackLink, Badge, Button, Card, confirmAction, LoadState, Screen, StatusMessage } from "~/components/ui";
import { useAction } from "~/hooks/use-action";
import { useLoad } from "~/hooks/use-load";
import { useReloadOnFocus } from "~/hooks/use-reload-on-focus";
import { spacing, type } from "~/theme";
import { CASE_STATUS_LABEL } from "@/lib/cases/constants/cases";
import { CLOSE_CASE_CONSEQUENCE } from "@/lib/cases/constants/cases";
import { WITHDRAW_LEAD_CONSEQUENCE } from "@/lib/leads/constants/leads";
import { canCloseCase } from "~/utils/case-actions";
import { caseTitle } from "~/utils/case-view";
import { formatDate } from "~/utils/format";

// Sagsskærmen: sagens behandlinger og hvert lead med klinikkens svar (architecture 13.4). Hentes igen ved fokus.
export function CaseScreen() {
  const router = useRouter();
  const { caseId } = useLocalSearchParams<{ caseId: string }>();
  const data = useLoad(async () => {
    const [caseDto, leads] = await Promise.all([getCase(caseId), listCaseLeads(caseId)]);
    return { caseDto, leads };
  }, [caseId]);
  useReloadOnFocus(data.reload);

  // Træk tilbage og luk sag: efter bekræftelsen hentes sagen og leadsene igen, så status ses med det samme.
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);
  const withdraw = useAction(async (leadId: string) => {
    setWithdrawingId(leadId);
    try {
      await withdrawLead(leadId);
    } finally {
      setWithdrawingId(null);
      data.reload(); // også ved LEAD_NOT_PENDING, så den nyeste status vises
    }
  });
  const close = useAction(async () => {
    await closeCase(caseId);
    data.reload();
  });
  const actionError = withdraw.error ?? close.error;

  const askWithdraw = (leadId: string, clinicName: string) =>
    confirmAction({
      title: `Træk henvendelsen til ${clinicName} tilbage?`,
      message: WITHDRAW_LEAD_CONSEQUENCE,
      confirmLabel: "Træk tilbage",
      onConfirm: () => void withdraw.run(leadId),
    });
  const askClose = () =>
    confirmAction({ title: "Luk sagen?", message: CLOSE_CASE_CONSEQUENCE, confirmLabel: "Luk sagen", onConfirm: () => void close.run() });

  return (
    <Screen>
      <BackLink label="Mine sager" onPress={() => (router.canGoBack() ? router.back() : router.replace("/sager"))} />
      <LoadState {...data} onRetry={data.reload}>
        {({ caseDto, leads }) => (
          <>
            <View style={styles.head}>
              <Text accessibilityRole="header" style={styles.title}>
                {caseTitle({ serviceNames: caseDto.services.map((s) => s.name), isEmergency: caseDto.isEmergency })}
              </Text>
              <Badge label={CASE_STATUS_LABEL[caseDto.status]} tone="info" />
              {caseDto.submittedAt ? <Text style={styles.muted}>Sendt {formatDate(caseDto.submittedAt)}</Text> : null}
            </View>
            {actionError ? <StatusMessage message={actionError} tone="danger" /> : null}
            {leads.length === 0 ? (
              <Card>
                <Text style={styles.muted}>Du har ikke kontaktet nogen klinikker med denne sag endnu.</Text>
                <Button label="Se klinikker der kan hjælpe" onPress={() => router.push({ pathname: "/klinikker", params: { sag: caseId } })} />
              </Card>
            ) : (
              leads.map((lead) => (
                <LeadRow
                  key={lead.id}
                  lead={lead}
                  onBook={() => router.push({ pathname: "/sag/[caseId]/book/[leadId]", params: { caseId, leadId: lead.id } })}
                  onMessages={() => router.push({ pathname: "/sag/[caseId]/beskeder/[leadId]", params: { caseId, leadId: lead.id } })}
                  onWithdraw={() => askWithdraw(lead.id, lead.clinic.name)}
                  withdrawing={withdrawingId === lead.id}
                />
              ))
            )}
            {canCloseCase(caseDto.status) ? <Button label="Luk sagen" variant="secondary" loading={close.pending} onPress={askClose} /> : null}
            <Text style={styles.muted}>Klinikken laver den endelige vurdering. Kontaktoplysninger deles først, når du har booket en tid.</Text>
          </>
        )}
      </LoadState>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { gap: spacing.sm },
  title: type.screenTitle,
  muted: type.caption,
});
