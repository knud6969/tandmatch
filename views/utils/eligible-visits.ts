import type { ReviewEligibleItemDto } from "@/lib/types/reviews";
import { apiRequest } from "@/views/utils/api-client";

// Gennemførte besøg, patienten kan anmelde (GET /api/reviews/eligible).
export const loadEligibleVisits = async (): Promise<ReviewEligibleItemDto[]> =>
  (await apiRequest<{ items: ReviewEligibleItemDto[] }>("/api/reviews/eligible")).items;
