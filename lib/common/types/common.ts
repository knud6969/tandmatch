import type { TRUSTPILOT_ENTERED_BY } from "@/lib/constants/clinics";
import type { CONSENT_TYPES } from "@/lib/identity/constants/consents";
import type { ROLES } from "@/lib/identity/constants/roles";

export type Role = (typeof ROLES)[number];
export type ConsentType = (typeof CONSENT_TYPES)[number];
export type PriceRange = { min: number; max: number }; // hele kroner

// Trustpilot-score og -link, indtastet manuelt (architecture 4.3, 8.4). `enteredBy` bestemmer mærkaten.
export type TrustpilotInfo = {
  url: string;
  score: number | null;
  reviewCount: number | null;
  updatedAt: string | null;
  enteredBy: (typeof TRUSTPILOT_ENTERED_BY)[number];
} | null;

export type ImageDto = {
  id: string;
  url: string; // signeret, 5 min
  view: string | null;
  quality: string | null;
  description: string | null; // AI'ens beskrivelse (ikke vurdering); patientens egne billeder, godkendes med opsummeringen
};
