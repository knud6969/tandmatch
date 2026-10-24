import { StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { getCase } from "~/api/cases";
import { listCaseLeads } from "~/api/leads";
import { LeadRow } from "~/components/case/lead-row";
import { BackLink, Badge, Button, Card, LoadState, Screen } from "~/components/ui";
import { useLoad } from "~/hooks/use-load";
import { useReloadOnFocus } from "~/hooks/use-reload-on-focus";
import { spacing, type } from "~/theme";
import { CASE_STATUS_LABEL } from "@/lib/cases/constants/cases";
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
                />
              ))
            )}
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
