import type { CONSENT_TYPES } from "@/lib/constants/consents";
import type { ROLES } from "@/lib/constants/roles";

export type Role = (typeof ROLES)[number];
export type ConsentType = (typeof CONSENT_TYPES)[number];
export type PriceRange = { min: number; max: number }; // hele kroner

export type ImageDto = {
  id: string;
  url: string; // signeret, 5 min
  view: string | null;
  quality: string | null;
};
