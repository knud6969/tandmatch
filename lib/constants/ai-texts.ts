import type { ImageQuality } from "@/lib/types/ai";

// Faste danske tekster om AI’ens grænser. Skrevet i koden og ikke af modellen (architecture 7.3, 7.5).
export const AI_BOUNDARY_TEXT = "AI-assistenten giver ikke medicinsk rådgivning. Tandlægen vurderer.";

// Vises når AI-svaret har registreret et emne, der er tandlægens opgave (architecture 7.3).
export const OUT_OF_SCOPE_NOTICE =
  "Det er tandlægens opgave at vurdere det. Send din forespørgsel, så får du en personlig vurdering.";

export const CHAT_NOT_SHARED_TEXT =
  "Samtalen deles ikke med tandlæger. Det er den opsummering, du godkender, der sendes.";

export const DESCRIPTION_LABEL = "Beskrivelse, ikke vurdering";

export const IMAGE_QUALITY_LABELS: Record<ImageQuality, string> = {
  ok: "God kvalitet",
  too_dark: "For mørkt",
  blurry: "Uskarpt",
  wrong_angle: "Forkert vinkel",
  not_teeth: "Viser ikke tænder",
};
