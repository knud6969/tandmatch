import type { MODERATION_KINDS } from "@/lib/admin/constants/admin";
import type { ModerationStatus, PriceAccuracy } from "@/lib/booking/types/reviews";
import type { ClinicStatus } from "@/lib/clinics/types/clinics";

// Admins visninger (features/admin 10.14). Ingen DTO indeholder patient_id, patientens navn eller kontaktoplysninger.
export type ModerationKind = (typeof MODERATION_KINDS)[number];

export type AdminClinicDto = {
  id: string;
  name: string;
  postalCode: string;
  city: string;
  cvr: string | null;
  status: ClinicStatus;
  hasOwner: boolean;
  verifiedAt: string | null;
  createdAt: string;
  canVerify: boolean; // status === "registered"
  canPause: boolean; // status === "verified"
};

type ModerationBase = {
  id: string;
  clinic: { id: string; name: string };
  createdAt: string;
  moderationStatus: ModerationStatus;
  rejectionReason: string | null;
  moderatedAt: string | null;
};

export type AdminModerationItemDto =
  | (ModerationBase & {
      kind: "review";
      stars: number;
      text: string;
      priceAccuracy: PriceAccuracy;
      actualPrice: number | null;
      lackedTransparency: boolean | null;
      transparencyComment: string | null;
    })
  | (ModerationBase & { kind: "reply"; reviewId: string; text: string; reviewExcerpt: string });
