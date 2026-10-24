import type { ImageDto } from "@/lib/common/types/common";
import { apiRequest } from "./client";

// Sagens billeder (architecture 9.3, 10.5). Kræver aktivt image_upload-samtykke; filen er allerede nedskaleret på telefonen.
export function uploadCaseImage(caseId: string, file: { uri: string; name: string; type: string }): Promise<ImageDto> {
  const form = new FormData();
  // React Native læser filen fra uri; typen er ikke i web-FormData's typer.
  form.append("file", file as unknown as Blob);
  return apiRequest<ImageDto>(`/api/cases/${caseId}/images`, { method: "POST", formData: form });
}

export function deleteCaseImage(caseId: string, imageId: string): Promise<void> {
  return apiRequest(`/api/cases/${caseId}/images/${imageId}`, { method: "DELETE" });
}
