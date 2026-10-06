import type { Role } from "@/lib/types/common";

export type NavItem = { href: string; label: string };

// Startside for hvert område. Bruges efter login og ved forkert rolle.
export const AREA_HOME: Record<Role, string> = {
  patient: "/patient",
  dentist: "/tandlaege",
  admin: "/",
};

// Navigation pr. rolle (områdenavigation i headeren).
export const AREA_NAV: Record<Role, NavItem[]> = {
  patient: [
    { href: "/patient", label: "Mine forespørgsler" },
    { href: "/patient/anmeldelser", label: "Anmeldelser" },
  ],
  dentist: [
    { href: "/tandlaege", label: "Indbakke" },
    { href: "/tandlaege/anmeldelser", label: "Anmeldelser" },
    { href: "/tandlaege/profil", label: "Profil" },
  ],
  admin: [],
};

export const AREA_LABEL: Record<Role, string> = {
  patient: "patienter",
  dentist: "tandlæger",
  admin: "administratorer",
};
