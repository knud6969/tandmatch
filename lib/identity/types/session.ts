import type { MobileSessionDto } from "@/lib/identity/types/auth";

// Svar fra POST /api/session/anonymous (architecture 10.2). `session` er kun med for appen ved en ny session (201).
export type AnonymousSessionDto = { caseId: string; expiresAt: string; session?: MobileSessionDto };
