import type { CONSENT_TYPES } from "@/lib/constants/consents";
import type { COSMETIC_CATEGORIES } from "@/lib/constants/categories";

export type Role = "patient" | "dentist" | "admin";
export type ConsentType = (typeof CONSENT_TYPES)[number];
export type CosmeticCategory = (typeof COSMETIC_CATEGORIES)[number];
export type PriceRange = { min: number; max: number }; // hele kroner
