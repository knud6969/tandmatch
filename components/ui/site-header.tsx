"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useSession } from "@/features/identity/ui";
import { Button, LinkButton } from "@/components/ui/button";
import { apiRequest } from "@/platform/ui-utils/api-client";
import { AreaTabs } from "@/components/ui/area-tabs";
import { AREA_NAV } from "@/lib/common/navigation/areas";
import { DIRECTORY_HREF, DIRECTORY_READY } from "@/lib/common/navigation/entries";

// Logget ud: knapper til login og oprettelse. Logget ind: områdets navigation og log ud.
export function SiteHeader() {
  const { state, refresh } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const me = state.status === "ready" ? state.me : null;
  // Kun klinikker har et område på weben; patienter bruger appen (architecture 13.6).
  const areaNav = me && me.role === "clinic" ? AREA_NAV[me.role] : [];
  // Den længste matchende sti er aktiv, så fx /klinik/lead/... markerer "Henvendelser".
  const navPath = pathname;
  const activeHref = areaNav
    .map((item) => item.href)
    .filter((href) => navPath === href || navPath.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0];

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

  // Klinikoversigten vises for alle undtagen klinikker og administratorer, når rollen er kendt.
  const showPatientEntries = state.status === "ready" && me?.role !== "clinic" && me?.role !== "admin";

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
          href="/"
          className="rounded-control text-xl font-bold tracking-tight text-brand-700 no-underline"
          aria-label="TandMatch, til forsiden"
        >
          TandMatch
        </Link>

        <div className="flex min-h-11 items-center gap-1 sm:gap-2">
          {showPatientEntries && DIRECTORY_READY && (
            <Link
              href={DIRECTORY_HREF}
              className="hidden min-h-11 items-center rounded-control px-3 text-base font-semibold text-ink no-underline hover:bg-surface-muted lg:flex"
            >
              Find en klinik
            </Link>
          )}
          {state.status === "loading" && <span className="sr-only">Indlæser login</span>}
          {state.status === "ready" && !me && (
            <>
              <LinkButton href="/login" variant="ghost" className="min-h-11 px-3">
                Log ind
              </LinkButton>
              <LinkButton href="/opret" variant="secondary" className="min-h-11 px-3">
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

      {areaNav.length > 0 && <AreaTabs items={areaNav} activeHref={activeHref} />}
    </header>
  );
}
