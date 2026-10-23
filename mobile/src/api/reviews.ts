import type { z } from "zod";
import type { createReviewSchema } from "@/lib/booking/schemas/reviews";
import type { ReviewCreatedDto, ReviewEligibleItemDto } from "@/lib/booking/types/reviews";
import { apiRequest } from "./client";

// Anmeldelser (architecture 10.13). Fejlkoderne REVIEW_NOT_ALLOWED og ALREADY_REVIEWED kommer som ApiRequestError med dansk tekst.

// Gennemførte besøg, patienten endnu ikke har anmeldt, med prisoverslaget.
export async function listEligibleReviews(): Promise<ReviewEligibleItemDto[]> {
  const result = await apiRequest<{ items: ReviewEligibleItemDto[] }>("/api/reviews/eligible");
  return result.items;
}

// Nye anmeldelser er altid `pending`, indtil de er modereret.
export function createReview(input: z.infer<typeof createReviewSchema>): Promise<ReviewCreatedDto> {
  return apiRequest<ReviewCreatedDto>("/api/reviews", { method: "POST", json: input });
}
