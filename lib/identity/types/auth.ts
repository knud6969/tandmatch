import type { ClinicSummaryDto } from "@/lib/clinics/types/clinics";
import type { Role } from "@/lib/common/types/common";

export type TermsStatusDto = {
  current: { termsVersion: string; privacyVersion: string };
  accepted: boolean;
};

export type TermsAcceptedDto = { acceptedAt: string };

export type AuthUserDto = { userId: string; role: Role };

export type MeDto = {
  id: string;
  role: Role;
  isAnonymous: boolean;
  displayName: string | null;
  anonymousExpiresAt: string | null;
  // Kun for rollen clinic (architecture 10.2).
  clinic?: ClinicSummaryDto;
};

// Tokens til patient-appen (architecture 10.2). expiresAt er adgangstokenets udløb (ISO 8601).
export type MobileSessionDto = { accessToken: string; refreshToken: string; expiresAt: string };

// Svar fra login, signup og convert. `session` er kun med, når requesten har X-TandMatch-Client: mobile.
export type AuthResultDto = AuthUserDto & { session?: MobileSessionDto };

// Svar fra POST /api/terms/accept. `termsToken` er kun med for appen.
export type TermsAcceptResultDto = TermsAcceptedDto & { termsToken?: string };

// Svar fra GET /api/auth/account (architecture 10.2): kun login-e-mailen.
export type AccountDto = { email: string };
