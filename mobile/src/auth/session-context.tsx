import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { MeDto } from "@/lib/types/auth";
import { ApiRequestError } from "~/api/client";
import { getMe } from "~/api/me";
import { clearSession, getSession, getTermsToken, subscribeAuthChange } from "./tokens";

export const CLINIC_ON_WEB_MESSAGE = "Klinikker logger ind på TandMatch på weben.";

export type SessionState = {
  // false, mens tokens læses fra SecureStore.
  ready: boolean;
  hasTerms: boolean;
  // Hvem der er logget ind; null = ingen session ("logget ud").
  me: MeDto | null;
  notice: string | null;
  // Midlertidig fejl ved hentning af /api/me (503 eller netværk): brugeren kan prøve igen.
  retryable: boolean;
  reload: () => void;
};

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [hasTerms, setHasTerms] = useState(false);
  const [me, setMe] = useState<MeDto | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [retryable, setRetryable] = useState(false);
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    const [terms, session] = await Promise.all([getTermsToken(), getSession()]);
    setHasTerms(terms !== null);
    setRetryable(false);
    if (!session) {
      setMe(null);
      setReady(true);
      return;
    }
    try {
      const result = await getMe();
      if (result.role !== "patient") {
        await clearSession();
        setMe(null);
        setNotice(CLINIC_ON_WEB_MESSAGE);
      } else {
        setMe(result);
        setNotice(null);
      }
    } catch (e) {
      // 401 efter mislykket fornyelse har allerede slettet tokens; midlertidige fejl beholder dem.
      if (e instanceof ApiRequestError && e.status !== 401 && e.code !== "TERMS_REQUIRED") setRetryable(true);
      else setMe(null);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    // Henter tokens fra SecureStore ved start og når klienten melder en ændring.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    return subscribeAuthChange(() => void load());
  }, [load, tick]);

  const value = useMemo<SessionState>(
    () => ({ ready, hasTerms, me, notice, retryable, reload: () => setTick((t) => t + 1) }),
    [ready, hasTerms, me, notice, retryable],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession kræver SessionProvider");
  return value;
}
