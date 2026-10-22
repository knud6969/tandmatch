import type { BadgeTone } from "@/components/ui/badge";
import type { ModerationStatus } from "@/lib/booking/types/reviews";

// Teksterne (MODERATION_LABEL) står i lib/booking/constants/reviews.ts; her ligger kun tonerne.
export const MODERATION_TONE: Record<ModerationStatus, BadgeTone> = {
  pending: "warning",
  approved: "brand",
  rejected: "danger",
};
