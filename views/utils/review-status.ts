import type { BadgeTone } from "@/views/components/ui/badge";
import type { ModerationStatus } from "@/lib/types/reviews";

// Moderationsstatus for anmeldelser og svar på dansk (architecture 8.5).
export const MODERATION_LABEL: Record<ModerationStatus, string> = {
  pending: "Afventer godkendelse",
  approved: "Offentliggjort",
  rejected: "Afvist",
};

export const MODERATION_TONE: Record<ModerationStatus, BadgeTone> = {
  pending: "warning",
  approved: "brand",
  rejected: "danger",
};
