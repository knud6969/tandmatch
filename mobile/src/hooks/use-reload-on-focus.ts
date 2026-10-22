import { useCallback, useRef } from "react";
import { useFocusEffect } from "expo-router";

// Henter data igen, når skærmen får fokus igen (fx efter en accept på klinik-weben eller en booking), men ikke ved første visning
// (13.5: ingen push; sag og bookinger hentes igen ved fokus).
export function useReloadOnFocus(reload: () => void) {
  const first = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (first.current) {
        first.current = false;
        return;
      }
      reload();
    }, [reload]),
  );
}
