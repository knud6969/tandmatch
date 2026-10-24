import { StyleSheet, Text } from "react-native";
import { useRouter } from "expo-router";
import { listCases } from "~/api/cases";
import { useSession } from "~/auth/session-context";
import { CaseListItem } from "~/components/case/case-list-item";
import { Button, Card, LoadState, Screen, StatusMessage } from "~/components/ui";
import { useLoad } from "~/hooks/use-load";
import { useReloadOnFocus } from "~/hooks/use-reload-on-focus";
import { type } from "~/theme";
import { caseRoute } from "~/utils/case-view";

// Sagerne for en patient med session; hentes igen, når fanen får fokus.
function CaseList() {
  const router = useRouter();
  const cases = useLoad(listCases);
  useReloadOnFocus(cases.reload);
  return (
    <LoadState {...cases} onRetry={cases.reload}>
      {(items) =>
        items.length === 0 ? (
          <Card>
            <Text style={styles.heading}>Ingen sager endnu</Text>
            <Button label="Beskriv dit problem" onPress={() => router.push("/start")} />
          </Card>
        ) : (
          items.map((item) => <CaseListItem key={item.id} item={item} onPress={() => router.push(caseRoute(item))} />)
        )
      }
    </LoadState>
  );
}

// Fanen "Mine sager": liste med status og næste booking (architecture 13.4), og vej til bookingerne.
export function CasesScreen() {
  const router = useRouter();
  const { status, reload } = useSession();
  if (status === "loading") return <Screen>{null}</Screen>;
  return (
    <Screen>
      <Text accessibilityRole="header" style={styles.title}>
        Mine sager
      </Text>
      {status === "unavailable" ? (
        <>
          <StatusMessage message="Vi kunne ikke hente din konto lige nu." tone="danger" />
          <Button label="Prøv igen" variant="secondary" onPress={reload} />
        </>
      ) : status === "none" ? (
        <Card>
          <Text style={styles.heading}>Du er ikke logget ind</Text>
          <Text style={styles.body}>Log ind for at se dine sager.</Text>
          <Button label="Log ind" onPress={() => router.push("/login")} />
        </Card>
      ) : (
        <>
          {status === "account" ? <Button label="Se mine bookinger" variant="secondary" onPress={() => router.push("/bookinger")} /> : null}
          <CaseList />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: type.screenTitle,
  heading: type.heading,
  body: type.body,
});
