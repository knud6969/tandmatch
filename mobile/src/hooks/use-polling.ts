import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import { startVisiblePolling, type VisibilitySource } from "@/lib/common/domain/polling";

// Adapter fra AppState til den delte hjælper: `active` svarer til synlig, alt andet (baggrund) til skjult.
function appVisibility(): VisibilitySource & { subscription: { remove: () => void } | null } {
  return {
    subscription: null,
    get visibilityState() {
      return AppState.currentState === "active" ? "visible" : "hidden";
    },
    addEventListener(_type, listener) {
      this.subscription = AppState.addEventListener("change", listener);
    },
    removeEventListener() {
      this.subscription?.remove();
      this.subscription = null;
    },
  };
}

// Kalder `tick` med jævne mellemrum, men kun mens skærmen er i fokus og appen er i forgrunden (architecture 13.5: ingen push,
// kun polling). Intervallet stoppes, når skærmen mister fokus, appen går i baggrunden eller skærmen lukkes; når appen kommer
// tilbage, hentes der straks. Første kald sker ellers først efter `intervalMs`.
export function useFocusPolling(tick: () => void | Promise<void>, intervalMs: number) {
  const latest = useRef(tick);
  useEffect(() => {
    latest.current = tick;
  }, [tick]);
  useFocusEffect(
    useCallback(() => startVisiblePolling(() => void latest.current(), intervalMs, appVisibility()), [intervalMs]),
  );
}
