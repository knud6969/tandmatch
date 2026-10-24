"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiRequestError } from "@/platform/ui-utils/api-client";
import { apiErrorMessage } from "@/platform/ui-utils/api-errors";
import { usePolling } from "@/platform/ui-utils/use-polling";

type LoadResult<T> = {
  data: T | null;
  error: string | null;
  errorCode: string | null;
  loading: boolean;
};

// Henter data ved første visning og giver en reload. `loader` skal være stabil (en funktion uden for komponenten).
// Med `pollMs` hentes der også stille i baggrunden (kun mens fanen er synlig): data erstattes uden at vise indlæsning, og en
// fejl i baggrunden beholder de data, der allerede vises.
export function useLoad<T>(loader: () => Promise<T>, options?: { pollMs?: number }): LoadResult<T> & { reload: () => void } {
  const [state, setState] = useState<LoadResult<T>>({
    data: null,
    error: null,
    errorCode: null,
    loading: true,
  });
  const [version, setVersion] = useState(0);
  // Tæller op ved hver første hentning og hver reload. Et pollsvar, der er startet i en tidligere generation, kasseres, så det ikke
  // overskriver nyere data eller en fejl fra en reload.
  const generation = useRef(0);
  const reloading = useRef(false);

  useEffect(() => {
    let active = true;
    generation.current += 1;
    reloading.current = true;
    loader().then(
      (data) => {
        reloading.current = false;
        if (active) setState({ data, error: null, errorCode: null, loading: false });
      },
      (error: unknown) => {
        reloading.current = false;
        if (active)
          setState({
            data: null,
            error: apiErrorMessage(error),
            errorCode: error instanceof ApiRequestError ? error.code : null,
            loading: false,
          });
      },
    );
    return () => {
      active = false;
    };
  }, [loader, version]);

  const refreshing = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  usePolling(
    () => {
      if (refreshing.current || reloading.current) return;
      refreshing.current = true;
      const started = generation.current;
      loader().then(
        (data) => {
          refreshing.current = false;
          if (mounted.current && started === generation.current && !reloading.current) {
            setState({ data, error: null, errorCode: null, loading: false });
          }
        },
        () => {
          refreshing.current = false;
        },
      );
    },
    // Ingen polling, mens der står en fejl (fx CLINIC_NOT_VERIFIED): den forsvinder ikke af sig selv.
    state.errorCode === null ? (options?.pollMs ?? null) : null,
  );

  const reload = useCallback(() => {
    generation.current += 1;
    setState((current) => ({
      ...current,
      loading: true,
      error: null,
      errorCode: null,
    }));
    setVersion((v) => v + 1);
  }, []);

  return { ...state, reload };
}
