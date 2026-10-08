"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useSession } from "@/views/components/session/session-provider";
import { Button, LinkButton } from "@/views/components/ui/button";
import { apiRequest } from "@/views/utils/api-client";
import { AREA_NAV } from "@/lib/navigation/areas";
import { cx } from "@/views/components/ui/cx";

// Logget ud: knapper til login og oprettelse. Logget ind: områdets navigation og log ud.
export function SiteHeader() {
  const { state, refresh } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const me = state.status === "ready" ? state.me : null;
  // Anonyme patienter har ingen områdenavigation: /patient kræver konto (architecture 6.5).
  const areaNav = me && !me.isAnonymous ? AREA_NAV[me.role] : [];
  // Den længste matchende sti er aktiv, så fx /tandlaege/forespoergsel/... markerer "Indbakke".
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

  const greeting = me
    ? me.isAnonymous
      ? "Anonym samtale"
      : me.displayName
        ? `Hej, ${me.displayName}`
        : "Logget ind"
    : null;

  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link
          href="/"
          className="rounded-md text-lg font-bold tracking-tight text-brand-700 no-underline"
          aria-label="TandMatch, til forsiden"
        >
          TandMatch
        </Link>

        <div className="flex min-h-11 items-center gap-2">
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

      {areaNav.length > 0 && (
        <nav aria-label="Områdenavigation" className="border-t border-line">
          <ul className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-2 sm:px-4">
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
