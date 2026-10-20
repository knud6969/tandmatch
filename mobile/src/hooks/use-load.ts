import { useCallback, useEffect, useState } from "react";
import { ApiRequestError } from "~/api/client";

// Fælles hook til alle hentninger, så indlæsning, fejl og "prøv igen" ser ens ud overalt.
export type LoadResult<T> = { data: T | null; error: string | null; loading: boolean; reload: () => void };

// Henter data ved start og når `reload` kaldes. Fejl bliver til danske tekster.
export function useLoad<T>(load: () => Promise<T>, deps: readonly unknown[] = []): LoadResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    // Et svar fra en forældet hentning (deps ændret eller skærmen lukket) må ikke overskrive nyere data.
    let cancelled = false;
    // Starter en ny hentning, når deps eller `reload` ændres.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    load()
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof ApiRequestError ? e.message : "Der opstod en fejl. Prøv igen om lidt.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload };
}
