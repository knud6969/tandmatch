// Anonyme sessioner slettes 48 timer efter seneste aktivitet (architecture 7.7).
export const ANONYMOUS_SESSION_HOURS = 48;

export function anonymousExpiresAt(lastActiveAtIso: string): string {
  const last = new Date(lastActiveAtIso).getTime();
  return new Date(last + ANONYMOUS_SESSION_HOURS * 60 * 60 * 1000).toISOString();
}
