"use client";

import { useCallback, useEffect, useState } from "react";
import { apiErrorMessage } from "@/views/utils/api-errors";

type LoadState<T> = { data: T | null; error: string | null; loading: boolean };

// Henter data ved første visning og giver en reload. `loader` skal være stabil (en funktion uden for komponenten).
export function useLoad<T>(loader: () => Promise<T>): LoadState<T> & { reload: () => void } {
  const [state, setState] = useState<LoadState<T>>({ data: null, error: null, loading: true });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    loader().then(
      (data) => {
        if (active) setState({ data, error: null, loading: false });
      },
      (error: unknown) => {
        if (active) setState({ data: null, error: apiErrorMessage(error), loading: false });
      },
    );
    return () => {
      active = false;
    };
  }, [loader, version]);

  const reload = useCallback(() => {
    setState((current) => ({ ...current, loading: true, error: null }));
    setVersion((v) => v + 1);
  }, []);

  return { ...state, reload };
}
