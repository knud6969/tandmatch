import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode, type RefObject } from "react";
import { ScrollView, StyleSheet, View, type HostInstance, type ScrollViewInstance } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing } from "~/theme";

// `footer` er en fast bundlinje under indholdet (fx den valgte tid og en knap).
type Props = { children: ReactNode; scroll?: boolean; footer?: ReactNode };

// Skærmen stiller "rul til dette element" til rådighed, så fejl kan rulles ind i billedet, når de dukker op.
type ScrollApi = { scrollTo: (node: HostInstance) => void };
const ScrollContext = createContext<ScrollApi | null>(null);

// Fælles skærmramme: sikkert område, scroll og tastaturvenlig. Kanten i bunden håndteres af fanebjælken.
export function Screen({ children, scroll = true, footer }: Props) {
  const scrollRef = useRef<ScrollViewInstance>(null);

  const scrollTo = useCallback((node: HostInstance) => {
    const view = scrollRef.current;
    const inner = view?.getInnerViewRef();
    if (!view || !inner) return;
    // Fejl i måling er ikke kritisk (fx i test); så bliver skærmen bare stående.
    try {
      node.measureLayout(
        inner,
        (_x: number, y: number) => view.scrollTo({ y: Math.max(0, y - spacing.xl), animated: true }),
        () => undefined,
      );
    } catch {
      // ignorer
    }
  }, []);
  const api = useMemo(() => ({ scrollTo }), [scrollTo]);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      {scroll ? (
        <ScrollContext.Provider value={api}>
          <ScrollView ref={scrollRef} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </ScrollContext.Provider>
      ) : (
        <View style={styles.content}>{children}</View>
      )}
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </SafeAreaView>
  );
}

// Ruller elementet ind i billedet, når `active` bliver sand (fx når en fejl vises). Uden for en Screen sker intet.
export function useScrollIntoView(ref: RefObject<HostInstance | null>, active: boolean, key?: string) {
  const api = useContext(ScrollContext);
  useEffect(() => {
    if (active && api && ref.current) api.scrollTo(ref.current);
  }, [active, api, ref, key]);
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  footer: { padding: spacing.lg, gap: spacing.sm, backgroundColor: colors.canvas, borderTopWidth: 1, borderTopColor: colors.line },
  content: { padding: spacing.lg, gap: spacing.lg, flexGrow: 1 },
});
