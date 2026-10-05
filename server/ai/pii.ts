// Maskering af personoplysninger før tekst sendes til OpenAI eller gemmes (architecture 7.2).
// Ren funktion uden server-imports, så den kan testes direkte.

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const CPR = /\b\d{6}-?\d{4}\b/g;
const PHONE = /(?:\+\s?45[\s-]?)?\b\d{2}[\s-]?\d{2}[\s-]?\d{2}[\s-]?\d{2}\b/g;

export const PII_MASK = "[fjernet]";

export function maskPii(text: string): string {
  return text.replace(EMAIL, PII_MASK).replace(CPR, PII_MASK).replace(PHONE, PII_MASK);
}
