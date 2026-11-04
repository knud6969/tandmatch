import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { GENERIC_ERROR_TEXT } from "@/lib/common/constants/error-texts";
import { addFavorite, getFavoriteIds, removeFavorite } from "~/api/favorites";
import { ApiRequestError } from "~/api/client";
import { useSession } from "~/auth/session-context";
import { accountGate } from "~/utils/account-gate";
import { toggleFavorite } from "~/utils/favorites";

// Gemte klinikker til hjertet i oversigten og på profilen (mobile 13.12). Id'erne hentes ved fokus, når patienten har konto.
// Uden konto (også anonym) åbner et tryk i stedet kortet "Opret en konto for at gemme klinikker".
export function useFavorites() {
  const { status } = useSession();
  const hasAccount = accountGate(status) === "content";
  const [ids, setIds] = useState<ReadonlySet<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Det nyeste sæt, så to hurtige tryk ikke bygger på et forældet.
  const latest = useRef<ReadonlySet<string>>(ids);
  const apply = useCallback((next: Set<string>) => {
    latest.current = next;
    setIds(next);
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!hasAccount) return;
      let cancelled = false;
      getFavoriteIds()
        .then((list) => {
          if (cancelled) return;
          apply(new Set(list));
          setLoaded(true);
        })
        .catch(() => undefined); // Uden id'er vises hjertet blot som ikke gemt.
      return () => {
        cancelled = true;
      };
    }, [hasAccount, apply]),
  );

  const toggle = useCallback(
    async (clinicId: string) => {
      if (status === "loading") return;
      if (!hasAccount) {
        setPromptOpen(true);
        return;
      }
      setError(null);
      const failure = await toggleFavorite(latest.current, clinicId, { add: addFavorite, remove: removeFavorite }, apply);
      if (failure) setError(failure instanceof ApiRequestError ? failure.message : GENERIC_ERROR_TEXT);
    },
    [status, hasAccount, apply],
  );

  return {
    isSaved: (clinicId: string) => ids.has(clinicId),
    loaded,
    toggle,
    error,
    promptOpen,
    closePrompt: () => setPromptOpen(false),
  };
}
