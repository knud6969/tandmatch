import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { MeDto } from "@/lib/identity/types/auth";
import { ApiRequestError } from "~/api/client";
import { getMe } from "~/api/me";
import { deriveSessionStatus, type SessionStatus } from "~/utils/session-status";
import { clearSession, getSession, getTermsToken, subscribeAuthChange } from "./tokens";

// Sessionen for hele appen (architecture 13.3): hvem der er logget ind, og om vilkår er accepteret.
// Appen er kun til patienter, så en klinik-konto afvises med denne tekst.
export const CLINIC_ON_WEB_MESSAGE = "Klinikker logger ind på TandMatch på weben.";

export type SessionState = {
  // false, mens tokens læses fra SecureStore.
  ready: boolean;
  hasTerms: boolean;
  // Den ene sandhed om login: loading | none | anonymous | account | unavailable. Skærme læser denne, ikke `me` direkte.
  status: SessionStatus;
  // Hvem der er logget ind; null = ingen session ("logget ud").
  me: MeDto | null;
  notice: string | null;
  // Midlertidig fejl ved hentning af /api/me (503 eller netværk): brugeren kan prøve igen.
  retryable: boolean;
  reload: () => void;
};

// Alt, en hentning afgør, ligger i ét objekt, så tokens, me og vilkår opdateres i ét setState (ingen halv tilstand).
type Snapshot = { ready: boolean; hasTerms: boolean; hasTokens: boolean; me: MeDto | null; notice: string | null; retryable: boolean };

const INITIAL: Snapshot = { ready: false, hasTerms: false, hasTokens: false, me: null, notice: null, retryable: false };

const SessionContext = createContext<SessionState | null>(null);

// Én hentning af tokens og /api/me.
async function readSnapshot(): Promise<Snapshot> {
  // Vilkårstoken og session læses fra SecureStore samtidig.
  const [terms, session] = await Promise.all([getTermsToken(), getSession()]);
  const base: Snapshot = { ready: true, hasTerms: terms !== null, hasTokens: session !== null, me: null, notice: null, retryable: false };
  if (!session) return base;
  try {
    const result = await getMe();
    if (result.role !== "patient") {
      await clearSession();
      return { ...base, hasTokens: false, notice: CLINIC_ON_WEB_MESSAGE };
    }
    return { ...base, me: result };
  } catch (e) {
    // 401 efter mislykket fornyelse har allerede slettet tokens; midlertidige fejl beholder dem.
    if (e instanceof ApiRequestError && e.status !== 401 && e.code !== "TERMS_REQUIRED") return { ...base, retryable: true };
    return { ...base, hasTokens: false };
  }
}

// Henter tokens og /api/me ved start og hver gang tokens ændres. `ready` er først sand, når første hentning er færdig,
// så skærmene ikke blinker mellem logget ind og ud. Hentninger kører efter hinanden (aldrig to samtidig), så et gammelt svar
// ikke kan overskrive et nyere; en ændring under en hentning giver en ny runde, og løftet er først færdigt efter den sidste.
export function SessionProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<Snapshot>(INITIAL);
  const inflight = useRef<Promise<void> | null>(null);
  const queued = useRef(false);

  const load = useCallback((): Promise<void> => {
    if (inflight.current) {
      queued.current = true;
      return inflight.current;
    }
    const loop = async () => {
      try {
        do {
          queued.current = false;
          setSnapshot(await readSnapshot());
        } while (queued.current);
      } finally {
        inflight.current = null;
      }
    };
    inflight.current = loop();
    return inflight.current;
  }, []);

  useEffect(() => {
    // Henter tokens fra SecureStore ved start og når klienten melder en ændring.
    void load();
    return subscribeAuthChange(load);
  }, [load]);

  const reload = useCallback(() => void load(), [load]);
  const value = useMemo<SessionState>(
    () => ({
      ready: snapshot.ready,
      hasTerms: snapshot.hasTerms,
      status: deriveSessionStatus(snapshot),
      me: snapshot.me,
      notice: snapshot.notice,
      retryable: snapshot.retryable,
      reload,
    }),
    [snapshot, reload],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

// Adgang til sessionen; kræver at SessionProvider ligger øverst i appen.
export function useSession(): SessionState {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession kræver SessionProvider");
  return value;
}
