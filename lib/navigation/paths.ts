// Validerer en redirect-sti (fx ?naeste=) så den kun peger inde på siden.
// Ingen åben redirect: kun stier der starter med "/", ikke "//" eller "/\", og ikke til API eller vilkårs-gaten selv.
const MAX_LENGTH = 500;
const SAFE_BASE = "https://tandmatch.invalid";

export function safeInternalPath(value: string | string[] | undefined): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_LENGTH) return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return null;
  // Kontrol-tegn og backslash kan omgå browserens parsing.
  if (/[\u0000-\u001F\u007F\\]/.test(value)) return null;
  if (value === "/api" || value.startsWith("/api/")) return null;
  if (value === "/vilkaar/accepter" || value.startsWith("/vilkaar/accepter?")) return null;

  try {
    const url = new URL(value, SAFE_BASE);
    if (url.origin !== SAFE_BASE) return null;
  } catch {
    return null;
  }
  return value;
}
