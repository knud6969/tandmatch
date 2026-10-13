"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useSession } from "@/views/components/session/session-provider";
import { Button, LinkButton } from "@/views/components/ui/button";
import { apiRequest } from "@/views/utils/api-client";
import { AREA_NAV } from "@/lib/navigation/areas";
import { CHAT_HREF, DIRECTORY_HREF, DIRECTORY_READY } from "@/lib/navigation/entries";
import { cx } from "@/views/components/ui/cx";

// Logget ud: knapper til login og oprettelse. Logget ind: områdets navigation og log ud.
export function SiteHeader() {
  const { state, refresh } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const me = state.status === "ready" ? state.me : null;
  // Anonyme patienter har ingen områdenavigation: områderne kræver konto (architecture 6.5).
  const areaNav = me && !me.isAnonymous ? AREA_NAV[me.role] : [];
  // Den længste matchende sti er aktiv, så fx /patient/sag/... markerer "Mine sager".
  const activeHref = areaNav
    .map((item) => item.href)
    .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
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

  // Chat-indgangen vises for alle undtagen klinikker (den er en patientindgang) og gæster, indtil rollen er kendt.
  const showChatEntry = state.status === "ready" && me?.role !== "clinic" && me?.role !== "admin";

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

        {showChatEntry && (
          <Link
            href={CHAT_HREF}
            className="hidden min-h-12 flex-1 items-center justify-between gap-3 rounded-pill border border-line bg-surface py-1.5 pr-1.5 pl-5 text-base text-ink-muted no-underline shadow-card transition-shadow hover:shadow-raised md:ml-6 md:flex md:max-w-md"
          >
            <span className="truncate">Beskriv dit problem eller upload et billede</span>
            <span className="rounded-pill bg-brand-600 px-4 py-2 text-sm font-semibold text-on-brand">
              Beskriv
            </span>
          </Link>
        )}

        <div className="flex min-h-11 items-center gap-1 sm:gap-2">
          {showChatEntry && DIRECTORY_READY && (
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

      {showChatEntry && (
        <div className="border-t border-line px-4 py-3 md:hidden">
          <Link
            href={CHAT_HREF}
            className="flex min-h-12 items-center justify-between gap-3 rounded-pill border border-line bg-surface py-1.5 pr-1.5 pl-5 text-base text-ink-muted no-underline shadow-card"
          >
            <span className="truncate">Beskriv dit problem</span>
            <span className="rounded-pill bg-brand-600 px-4 py-2 text-sm font-semibold text-on-brand">
              Start
            </span>
          </Link>
        </div>
      )}

      {areaNav.length > 0 && (
        <nav aria-label="Områdenavigation" className="border-t border-line">
          <ul className="mx-auto flex max-w-wide gap-1 overflow-x-auto px-2 sm:px-4">
            {areaNav.map((item) => {
              const active = item.href === activeHref;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cx(
                      "flex min-h-12 items-center whitespace-nowrap border-b-[3px] px-3 text-base font-semibold no-underline",
                      active
                        ? "border-brand-600 text-brand-800"
                        : "border-transparent text-ink-muted hover:text-ink",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </header>
  );
}
