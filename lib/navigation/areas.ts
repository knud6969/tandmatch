import type { Role } from "@/lib/types/common";

export type NavItem = { href: string; label: string };

// Startside for hvert område. Bruges efter login og ved forkert rolle.
export const AREA_HOME: Record<Role, string> = {
  patient: "/patient",
  clinic: "/klinik",
  admin: "/",
};

// Navigation pr. rolle (områdenavigation i headeren). Admin er tom, til siderne findes.
export const AREA_NAV: Record<Role, NavItem[]> = {
  patient: [
    { href: "/patient", label: "Mine sager" },
    { href: "/patient/bookinger", label: "Bookinger" },
    { href: "/patient/anmeldelser", label: "Anmeldelser" },
  ],
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
