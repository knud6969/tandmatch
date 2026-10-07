import type { RequestRecord } from "@/server/models/requests";
import type { ResponseRecord } from "@/server/models/responses";
import type { OwnReviewRow } from "@/server/models/reviews";
import type { ConsentDto } from "@/lib/types/requests";

// Dataeksport for egen konto (GDPR art. 15/20). Kun egne data; RLS afgør hvad der kan læses.
export type PatientExportDto = {
  exportedAt: string;
  requests: RequestRecord[];
  responses: ResponseRecord[];
  reviews: OwnReviewRow[];
  consents: ConsentDto[];
};
