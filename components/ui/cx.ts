// Sammensætter klassenavne og springer falske værdier over.
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}
