import { useCallback, useEffect, useRef } from "react";
import { useFocusEffect } from "expo-router";

// Kalder `tick` med jævne mellemrum, men kun mens skærmen er i fokus (kortlagt i architecture 13.5: ingen push, kun polling).
// Intervallet stoppes, når skærmen mister fokus eller lukkes. Første kald sker først efter `intervalMs`.
export function useFocusPolling(tick: () => void | Promise<void>, intervalMs: number) {
  const latest = useRef(tick);
  useEffect(() => {
    latest.current = tick;
  }, [tick]);
  useFocusEffect(
    useCallback(() => {
      const id = setInterval(() => void latest.current(), intervalMs);
      return () => clearInterval(id);
    }, [intervalMs]),
  );
}
