import type { TrustpilotInfo } from "@/lib/types/common";

// Trustpilot-kolonnerne som de står på clinics og i public_*-funktionerne (architecture 4.3, 8.4). Delt af
// ClinicsRepository og ClinicDirectoryRepository, så mappingen kun findes ét sted.
export type TrustpilotColumns = {
  trustpilot_url: string | null;
  trustpilot_score: number | null;
  trustpilot_review_count: number | null;
  trustpilot_updated_at: string | null;
  trustpilot_entered_by: string | null;
};

export function trustpilotFromColumns(row: TrustpilotColumns): TrustpilotInfo {
  if (!row.trustpilot_url) return null;
  return {
    url: row.trustpilot_url,
    score: row.trustpilot_score,
    reviewCount: row.trustpilot_review_count,
    updatedAt: row.trustpilot_updated_at,
    enteredBy: row.trustpilot_entered_by === "admin" ? "admin" : "clinic",
  };
}
