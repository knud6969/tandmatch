import type { LeadStatus } from "@/lib/types/leads";
import type { BadgeTone } from "@/components/ui/badge";

// Badge-tonen for et leads status. Samme for klinikkens indbakke og patientens sag.
export const LEAD_STATUS_TONE: Record<LeadStatus, BadgeTone> = {
  sent: "warning",
  accepted: "brand",
  booked: "brand",
  declined: "neutral",
  withdrawn: "neutral",
};
