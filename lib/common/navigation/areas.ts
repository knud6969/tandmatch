import type { Role } from "@/lib/common/types/common";

// `matches`: andre stier (og deres understier), hvor fanen også er aktiv, fx Klinikprofil på /klinik/prisliste.
export type NavItem = { href: string; label: string; matches?: string[] };

// Startside for hvert område. Bruges efter login og ved forkert rolle. Patienter har intet område på weben (de bruger appen).
export const AREA_HOME: Record<Role, string> = {
  patient: "/",
  clinic: "/klinik",
  admin: "/",
};

// Navigation pr. rolle (områdenavigation i headeren). Patient og admin er tomme: patienter bruger appen, og admin har ingen sider.
export const AREA_NAV: Record<Role, NavItem[]> = {
  patient: [],
  clinic: [
    { href: "/klinik", label: "Henvendelser" },
    { href: "/klinik/kalender", label: "Kalender" },
    { href: "/klinik/anmeldelser", label: "Anmeldelser" },
    { href: "/klinik/profil", label: "Klinikprofil", matches: ["/klinik/prisliste", "/klinik/aabningstider", "/klinik/tandlaeger"] },
  ],
  admin: [],
};

// Den aktive fane for en sti: den længste matchende sti (href eller matches) vinder, så fx /klinik/lead/... markerer
// "Henvendelser" og /klinik/prisliste "Klinikprofil". Returnerer fanens href.
export function activeNavHref(items: NavItem[], pathname: string): string | undefined {
  let best: { href: string; length: number } | undefined;
  for (const item of items) {
    for (const path of [item.href, ...(item.matches ?? [])]) {
      if ((pathname === path || pathname.startsWith(`${path}/`)) && (!best || path.length > best.length)) {
        best = { href: item.href, length: path.length };
      }
    }
  }
  return best?.href;
}
