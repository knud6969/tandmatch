import type { Role } from "@/lib/types/common";

export type NavItem = { href: string; label: string };

// Startside for hvert område. Bruges efter login og ved forkert rolle.
// MIDLERTIDIGT (0.9): patient og clinic peger på "/", fordi /patient og /klinik ikke findes endnu. Sættes til "/patient" og "/klinik", når områdernes sider bygges.
export const AREA_HOME: Record<Role, string> = {
  patient: "/",
  clinic: "/",
  admin: "/",
};

// Navigation pr. rolle (områdenavigation i headeren). Tomme, til områdernes sider findes (trin 3-5).
export const AREA_NAV: Record<Role, NavItem[]> = {
  patient: [],
  clinic: [],
  admin: [],
};

export const AREA_LABEL: Record<Role, string> = {
  patient: "patienter",
  clinic: "klinikker",
  admin: "administratorer",
};
