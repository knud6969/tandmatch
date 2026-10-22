import type { ZodError } from "zod";

// Zod-fejl som én besked pr. felt (første fejl vinder). Spejler platform/ui-utils/field-errors.ts.
export type FieldErrors<K extends string> = Partial<Record<K, string>>;

// Bruges til at vise fejl ved det felt, der er forkert.
export function fieldErrorsFrom<K extends string>(error: ZodError): FieldErrors<K> {
  const fields: FieldErrors<K> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !(key in fields)) fields[key as K] = issue.message;
  }
  return fields;
}
