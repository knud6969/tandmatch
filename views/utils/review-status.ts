import type { BadgeTone } from "@/views/components/ui/badge";
import type { ModerationStatus } from "@/lib/types/reviews";

// Teksterne står i lib/constants/reviews.ts; de eksporteres videre, så eksisterende importer virker.
export { MODERATION_LABEL } from "@/lib/constants/reviews";

export const MODERATION_TONE: Record<ModerationStatus, BadgeTone> = {
  pending: "warning",
  approved: "brand",
  rejected: "danger",
};
