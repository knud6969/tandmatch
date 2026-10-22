import type { Role } from "@/lib/common/types/common";

export type NavItem = { href: string; label: string };

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
    { href: "/klinik/profil", label: "Profil" },
    { href: "/klinik/prisliste", label: "Prisliste" },
    { href: "/klinik/aabningstider", label: "Åbningstider" },
    { href: "/klinik/tandlaeger", label: "Tandlæger" },
  ],
  admin: [],
};
