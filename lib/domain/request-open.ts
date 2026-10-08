import type { RequestStatus } from "@/lib/types/common";

// En forespørgsel er åben for svar, når den er sendt og ikke udløbet (architecture 6.6, 10.6).
// Samme regel som serveren (controllers/responsesController.ts), så UI'et ikke viser knapper, der fejler.
export function isOpenForResponses(status: RequestStatus, expiresAt: string | null, now = Date.now()): boolean {
  return status === "sent" && expiresAt !== null && Date.parse(expiresAt) > now;
}
