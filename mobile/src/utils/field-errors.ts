import type { ZodError } from "zod";
import { fieldErrorsFrom as fieldErrorsWithGeneral } from "@/lib/common/domain/field-errors";

// Appens formularer viser kun fejl ved felterne, så kun `fields` fra den fælles kerne i lib/ bruges.
export type FieldErrors<K extends string> = Partial<Record<K, string>>;

export function fieldErrorsFrom<K extends string>(error: ZodError): FieldErrors<K> {
  return fieldErrorsWithGeneral<K>(error).fields;
}
