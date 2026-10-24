import type { ImageDto } from "@/lib/common/types/common";
import { apiRequest } from "./client";

// Sagens billeder (architecture 9.3, 10.5). Kræver aktivt image_upload-samtykke; filen er allerede nedskaleret på telefonen.
// Kroppen er færdigbygget multipart som bytes (kendt længde): RN's { uri }-FormData virker ikke med expo/fetch.
export function uploadCaseImage(caseId: string, multipart: { body: Uint8Array; contentType: string }): Promise<ImageDto> {
  return apiRequest<ImageDto>(`/api/cases/${caseId}/images`, { method: "POST", rawBody: multipart });
}

export function deleteCaseImage(caseId: string, imageId: string): Promise<void> {
  return apiRequest(`/api/cases/${caseId}/images/${imageId}`, { method: "DELETE" });
}
