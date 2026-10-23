// Hvor login og oprettelse sender patienten hen bagefter. Kun faste interne stier er tilladt, så en parameter aldrig kan
// sende patienten et uventet sted hen; alt andet giver standardstien.
export const RETURN_TO_PATHS = ["/akut"] as const;
export type ReturnTo = (typeof RETURN_TO_PATHS)[number];

export const DEFAULT_RETURN_TO = "/konto";

export function safeReturnTo(value: string | string[] | undefined): ReturnTo | null {
  return typeof value === "string" && (RETURN_TO_PATHS as readonly string[]).includes(value) ? (value as ReturnTo) : null;
}
