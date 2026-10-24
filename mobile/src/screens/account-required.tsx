import type { ReactNode } from "react";
import { Text } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { useSession } from "~/auth/session-context";
import { Button, Card, LoadState, Screen, StatusMessage } from "~/components/ui";
import { type } from "~/theme";
import { accountGate } from "~/utils/account-gate";
import { safeReturnTo } from "~/utils/return-to";

type Props = {
  // Overskrift på kortet, fx "Log ind for at se dine bookinger".
  title: string;
  children: ReactNode;
};

// Fælles port for skærme, der kræver en konto: indholdet (og dermed dets API-kald) vises først, når status er `account`.
// Anonyme og udloggede får et kort med "Log ind" og "Opret konto", og efter login/oprettelse vender patienten tilbage hertil.
export function AccountRequired({ title, children }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { status, reload } = useSession();
  const gate = accountGate(status);
  if (gate === "content") return <>{children}</>;

  // Kun faste stier føres med; et ukendt sted giver standardmålet.
  const returnTo = safeReturnTo(pathname);
  const params = returnTo ? { returnTo } : {};
  return (
    <Screen>
      {gate === "spinner" ? (
        <LoadState loading error={null} data={null} onRetry={reload}>
          {() => null}
        </LoadState>
      ) : gate === "retry" ? (
        <>
          <StatusMessage message="Vi kunne ikke hente din konto lige nu." tone="danger" />
          <Button label="Prøv igen" variant="secondary" onPress={reload} />
        </>
      ) : (
        <Card>
          <Text accessibilityRole="header" style={type.heading}>
            {title}
          </Text>
          <Button label="Log ind" onPress={() => router.push({ pathname: "/login", params })} />
          <Button label="Opret konto" variant="secondary" onPress={() => router.push({ pathname: "/opret", params })} />
        </Card>
      )}
    </Screen>
  );
}

