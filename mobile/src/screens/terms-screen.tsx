import { useState } from "react";
import { StyleSheet, Text } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { acceptTerms } from "~/api/terms";
import { Button, Checkbox, CheckboxText, Screen, StatusMessage } from "~/components/ui";
import { useAction } from "~/hooks/use-action";
import { colors, fontSize, spacing } from "~/theme";

function webUrl(path: string): string {
  return `${(process.env.EXPO_PUBLIC_API_URL ?? "http://127.0.0.1:3000").replace(/\/+$/, "")}${path}`;
}

// Vilkårsskærmen: vises, indtil brugeren har accepteret vilkår og læst privatlivspolitikken (architecture 2.5, 13.3).
export function TermsScreen() {
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const { run, pending, error } = useAction(acceptTerms);

  return (
    <Screen>
      <Text accessibilityRole="header" style={styles.title}>
        Velkommen til TandMatch
      </Text>
      <Text style={styles.body}>Før du går i gang, skal du acceptere vilkårene og bekræfte, at du har læst privatlivspolitikken.</Text>
      <Button label="Læs brugervilkårene" variant="secondary" onPress={() => void WebBrowser.openBrowserAsync(webUrl("/vilkaar"))} />
      <Button label="Læs privatlivspolitikken" variant="secondary" onPress={() => void WebBrowser.openBrowserAsync(webUrl("/privatliv"))} />
      <Checkbox checked={terms} onChange={setTerms} accessibilityLabel="Jeg accepterer brugervilkårene">
        <CheckboxText>Jeg accepterer brugervilkårene.</CheckboxText>
      </Checkbox>
      <Checkbox checked={privacy} onChange={setPrivacy} accessibilityLabel="Jeg har læst privatlivspolitikken">
        <CheckboxText>Jeg har læst privatlivspolitikken.</CheckboxText>
      </Checkbox>
      {error ? <StatusMessage message={error} tone="danger" /> : null}
      <Button label="Fortsæt" disabled={!terms || !privacy} loading={pending} onPress={() => void run()} />
      <Text style={styles.note}>Vilkårene er ikke dit samtykke til at dele helbredsoplysninger. Det spørger vi om særskilt, når det er relevant.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: fontSize.xxl, fontWeight: "700", color: colors.ink },
  body: { fontSize: fontSize.md, color: colors.ink, lineHeight: 24 },
  note: { fontSize: fontSize.sm, color: colors.inkMuted, marginTop: spacing.sm },
});
