import type { Role } from "@/lib/types/common";

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
};
