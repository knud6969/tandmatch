import type { ReactNode } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { colors, spacing } from "~/theme";
import { Button } from "./button";
import { StatusMessage } from "./status-message";

// Indlæsningsfejl med "Prøv igen": den ene måde at vise, at noget ikke kunne hentes, eller at en handling kan gentages.
export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.box}>
      <StatusMessage message={message} tone="danger" />
      <Button label="Prøv igen" variant="secondary" onPress={onRetry} />
    </View>
  );
}

type Props<T> = {
  loading: boolean;
  error: string | null;
  data: T | null;
  onRetry: () => void;
  children: (data: T) => ReactNode;
};

// Viser indlæsning, fejl med "Prøv igen" eller indholdet.
export function LoadState<T>({ loading, error, data, onRetry, children }: Props<T>) {
  if (error) return <LoadError message={error} onRetry={onRetry} />;
  if (loading || data === null) {
    return (
      <View style={styles.center} accessibilityLabel="Henter">
        <ActivityIndicator color={colors.brand600} size="large" />
      </View>
    );
  }
  return <>{children(data)}</>;
}

const styles = StyleSheet.create({
  box: { gap: spacing.md },
  center: { padding: spacing.xxl, alignItems: "center" },
});
