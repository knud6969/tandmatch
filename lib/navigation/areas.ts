import type { Role } from "@/lib/types/common";

export type NavItem = { href: string; label: string };

// Startside for hvert område. Bruges efter login og ved forkert rolle.
// MIDLERTIDIGT: patient peger på "/", til /patient bygges (trin 4). Klinikken har sit område på /klinik.
export const AREA_HOME: Record<Role, string> = {
  patient: "/",
  clinic: "/klinik",
  admin: "/",
};

// Navigation pr. rolle (områdenavigation i headeren). Patient og admin er tomme, til deres sider findes.
export const AREA_NAV: Record<Role, NavItem[]> = {
  patient: [],
  clinic: [
    { href: "/klinik", label: "Oversigt" },
    { href: "/klinik/profil", label: "Profil" },
    { href: "/klinik/prisliste", label: "Prisliste" },
    { href: "/klinik/aabningstider", label: "Åbningstider" },
    { href: "/klinik/tandlaeger", label: "Tandlæger" },
  ],
  admin: [],
};
