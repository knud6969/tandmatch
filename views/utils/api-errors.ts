import { apiErrorText } from "@/lib/domain/errors";
import { ApiRequestError } from "@/views/utils/api-client";
import { ImagePrepareError } from "@/views/utils/prepare-image";

// Danske fejlbeskeder ud fra API-fejl (architecture 2.4). Teksterne og udvælgelsen ligger i lib/ og deles med appen.
export function apiErrorMessage(error: unknown): string {
  if (error instanceof ImagePrepareError) return error.message;
  if (error instanceof ApiRequestError) return apiErrorText(error.code, error.message);
  return "Der opstod en uventet fejl. Prøv igen om lidt.";
}
