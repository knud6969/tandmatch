import { useCallback, useState } from "react";
import { GENERIC_ERROR_TEXT } from "@/lib/common/constants/error-texts";
import { ApiRequestError } from "~/api/client";

// Kører en handling (fx knaptryk) med pending- og fejltilstand. Fejl bliver til danske tekster.
// `run` returnerer undefined ved fejl, så kalderen kan se, at handlingen ikke lykkedes.
export function useAction<Args extends unknown[], R>(action: (...args: Args) => Promise<R>) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (...args: Args): Promise<R | undefined> => {
      setPending(true);
      setError(null);
      try {
        return await action(...args);
      } catch (e) {
        setError(e instanceof ApiRequestError ? e.message : GENERIC_ERROR_TEXT);
        return undefined;
      } finally {
        setPending(false);
      }
    },
    [action],
  );

  return { run, pending, error, clearError: () => setError(null) };
}
