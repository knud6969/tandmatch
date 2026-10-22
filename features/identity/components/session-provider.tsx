"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getMe } from "@/platform/ui-utils/api-client";
import type { MeDto } from "@/lib/identity/types/auth";

export type SessionState =
  | { status: "loading" }
  | { status: "ready"; me: MeDto | null }
  | { status: "error" };

type SessionContextValue = {
  state: SessionState;
  refresh: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

async function loadSession(): Promise<SessionState> {
  try {
    return { status: "ready", me: await getMe() };
  } catch {
    return { status: "error" };
  }
}

// Henter /api/me én gang pr. sideindlæsning og deler resultatet med header, rollevagt og banners.
export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: "loading" });

  const refresh = useCallback(async () => {
    setState(await loadSession());
  }, []);

  useEffect(() => {
    let active = true;
    loadSession().then((next) => {
      if (active) setState(next);
    });
    return () => {
      active = false;
    };
  }, []);

  const value = useMemo(() => ({ state, refresh }), [state, refresh]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession skal bruges inde i SessionProvider");
  }
  return context;
}
