// Hvor login og oprettelse sender patienten hen bagefter. Kun faste interne mønstre er tilladt, så en parameter aldrig kan
// sende patienten et uventet sted hen; alt andet giver standardstien.
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

export const RETURN_TO_PATTERNS: readonly RegExp[] = [
  /^\/akut$/,
  /^\/bookinger$/,
  /^\/sager$/,
  new RegExp(`^/sag/${UUID}$`, "i"),
  new RegExp(`^/sag/${UUID}/book/${UUID}$`, "i"),
  new RegExp(`^/sag/${UUID}/beskeder/${UUID}$`, "i"),
  new RegExp(`^/anmeld/${UUID}$`, "i"),
];

export type ReturnTo = string;

export const DEFAULT_RETURN_TO = "/konto";

export function safeReturnTo(value: string | string[] | undefined): ReturnTo | null {
  return typeof value === "string" && RETURN_TO_PATTERNS.some((p) => p.test(value)) ? value : null;
}
