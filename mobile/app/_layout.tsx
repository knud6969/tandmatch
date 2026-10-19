import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, View } from "react-native";
import { SessionProvider, useSession } from "~/auth/session-context";
import { colors } from "~/theme";

// Vilkårsvagten: uden gyldigt vilkårstoken vises kun vilkårsskærmen (architecture 13.3).
function Guarded() {
  const { ready, hasTerms } = useSession();
  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.canvas }}>
        <ActivityIndicator color={colors.brand600} size="large" />
      </View>
    );
  }
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }}>
      <Stack.Protected guard={hasTerms}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="login" />
        <Stack.Screen name="opret" />
        <Stack.Screen name="klinik/[clinicId]" />
      </Stack.Protected>
      <Stack.Protected guard={!hasTerms}>
        <Stack.Screen name="vilkaar" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SessionProvider>
      <StatusBar style="dark" />
      <Guarded />
    </SessionProvider>
  );
}
