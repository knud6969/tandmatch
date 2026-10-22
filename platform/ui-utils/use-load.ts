"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiRequestError } from "@/platform/ui-utils/api-client";
import { apiErrorMessage } from "@/platform/ui-utils/api-errors";

type LoadResult<T> = {
  data: T | null;
  error: string | null;
  errorCode: string | null;
  loading: boolean;
};

// Henter data ved første visning og giver en reload. `loader` skal være stabil (en funktion uden for komponenten).
export function useLoad<T>(loader: () => Promise<T>): LoadResult<T> & { reload: () => void } {
  const [state, setState] = useState<LoadResult<T>>({
    data: null,
    error: null,
    errorCode: null,
    loading: true,
  });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    loader().then(
      (data) => {
        if (active) setState({ data, error: null, errorCode: null, loading: false });
      },
      (error: unknown) => {
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

  const reload = useCallback(() => {
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
