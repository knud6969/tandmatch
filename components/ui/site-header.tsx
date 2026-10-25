"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useSession } from "@/features/identity/ui";
import { Button, LinkButton } from "@/components/ui/button";
import { apiRequest } from "@/platform/ui-utils/api-client";
import { AreaTabs } from "@/components/ui/area-tabs";
import { AREA_HOME, AREA_NAV, activeNavHref } from "@/lib/common/navigation/areas";
import { useLeadsNeedingActionCount } from "@/features/leads/ui";

// Logget ud: knapper til login og oprettelse. Logget ind: områdets navigation og log ud.
export function SiteHeader() {
  const { state, refresh } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const me = state.status === "ready" ? state.me : null;
  // Kun klinikker har et område på weben; patienter bruger appen (architecture 13.6).
  const areaNav = me && me.role === "clinic" ? AREA_NAV[me.role] : [];
  // Den længste matchende sti er aktiv, så fx /klinik/lead/... markerer "Henvendelser" og /klinik/prisliste "Klinikprofil".
  const activeHref = activeNavHref(areaNav, pathname);
  // Antal henvendelser, der kræver handling, på fanen Henvendelser (delt hentning med indbakken; 0 for andre end klinikker).
  const needingAction = useLeadsNeedingActionCount();
  const counts = { [AREA_HOME.clinic]: { value: needingAction, label: needingAction === 1 ? "1 kræver handling" : `${needingAction} kræver handling` } };

  async function logout() {
    setLoggingOut(true);
    try {
      await apiRequest<void>("/api/auth/logout", { method: "POST" });
    } catch {
      // Hvis kaldet fejler, opdaterer vi alligevel visningen. Serveren er den endelige barriere.
    }
    await refresh();
    router.replace("/");
    router.refresh();
    setLoggingOut(false);
  }

  const greeting = me
    ? me.isAnonymous
      ? "Anonym samtale"
      : me.displayName
        ? `Hej, ${me.displayName}`
        : "Logget ind"
    : null;

  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-wide items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link
          href={me?.role === "clinic" ? AREA_HOME.clinic : "/"}
          className="rounded-control text-xl font-bold tracking-tight text-brand-700 no-underline"
          aria-label={me?.role === "clinic" ? "TandMatch, til henvendelser" : "TandMatch, til forsiden"}
        >
          TandMatch
        </Link>

        <div className="flex min-h-11 items-center gap-1 sm:gap-2">
          {state.status === "loading" && <span className="sr-only">Indlæser login</span>}
          {state.status === "ready" && !me && (
            <>
              <LinkButton href="/login" variant="ghost" className="min-h-11 px-3">
                Log ind
              </LinkButton>
              <LinkButton href="/opret/klinik" variant="secondary" className="min-h-11 px-3">
                Opret konto
              </LinkButton>
            </>
          )}
          {me && (
            <>
              {greeting && (
                <span className="hidden max-w-[12rem] truncate text-sm text-ink-muted sm:inline">{greeting}</span>
              )}
              <Button variant="ghost" className="min-h-11 px-3" onClick={logout} disabled={loggingOut}>
                {loggingOut ? "Logger ud …" : "Log ud"}
              </Button>
            </>
          )}
        </div>
      </div>

      {areaNav.length > 0 && <AreaTabs items={areaNav} activeHref={activeHref} counts={counts} />}
    </header>
  );
}
