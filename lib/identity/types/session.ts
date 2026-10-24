import type { MobileSessionDto } from "@/lib/identity/types/auth";

// Svar fra POST /api/session/anonymous (architecture 10.2). `session` er kun med for appen ved en ny session (201).
export type AnonymousSessionDto = { caseId: string; expiresAt: string; session?: MobileSessionDto };

// Svar fra POST /api/session/claim-token (architecture 10.2). Engangs-token, gyldigt i 15 minutter.
export type ClaimTokenDto = { claimToken: string; expiresAt: string };

// Svar fra POST /api/session/claim. `caseId` er den overtagne sag, eller null når der ingen kladde med indhold var.
export type ClaimResultDto = { caseId: string | null; moved: boolean };
