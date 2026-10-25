// Anonyme sessioner slettes 48 timer efter seneste aktivitet (architecture 7.7).
export const ANONYMOUS_SESSION_HOURS = 48;

export function anonymousExpiresAt(lastActiveAtIso: string): string {
  const last = new Date(lastActiveAtIso).getTime();
  return new Date(last + ANONYMOUS_SESSION_HOURS * 60 * 60 * 1000).toISOString();
}

// Patient-appen (Expo) bruger Authorization: Bearer og X-Terms-Token i stedet for cookies (architecture 2.4, 2.5).
export const MOBILE_CLIENT_HEADER = "X-TandMatch-Client";
export const MOBILE_CLIENT_VALUE = "mobile";
export const TERMS_TOKEN_HEADER = "X-Terms-Token";

// Et link til at nulstille adgangskoden giver en recovery-session; den nye adgangskode skal sættes inden for dette vindue
// (architecture 10.2, POST /api/auth/password/reset).
export const PASSWORD_RECOVERY_WINDOW_MINUTES = 15;
