import type { ZodError } from "zod";

export type FieldErrors<K extends string> = {
  fields: Partial<Record<K, string>>;
  // Fejl der ikke kan knyttes til et felt (fx valg af rolle).
  general: string | null;
};

// Oversætter zod-fejl til en besked pr. felt. Første fejl pr. felt vinder.
export function fieldErrorsFrom<K extends string>(error: ZodError): FieldErrors<K> {
  const fields: Partial<Record<K, string>> = {};
  let general: string | null = null;
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string") {
      if (!(key in fields)) fields[key as K] = issue.message;
    } else if (general === null) {
      general = issue.message;
    }
  }
  return { fields, general };
}
