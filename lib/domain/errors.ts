import { API_ERROR_TEXTS, GENERIC_ERROR_TEXT, NEUTRAL_ERROR_TEXTS } from "@/lib/constants/error-texts";

// Serverens besked bruges kun, hvis den er kort og dansk. Engelske standardfejl fra zod (fx "Invalid input") vises ikke.
const ENGLISH_HINTS = /\b(invalid|expected|too (small|big)|unrecognized|required|received)\b/i;
function usableServerMessage(message: string): string | null {
  const text = message.trim();
  if (text === "" || text.length > 300 || ENGLISH_HINTS.test(text)) return null;
  return text;
}

// Dansk fejltekst ud fra API-fejlkode og serverens besked (delt af web og app, architecture 2.4). Kendt kode giver
// den faste tekst; ellers bruges serverens besked, hvis den er dansk og kort; ellers en neutral tekst.
export function apiErrorText(code: string, serverMessage: string): string {
  const known = API_ERROR_TEXTS[code];
  if (known) return known;
  return usableServerMessage(serverMessage) ?? NEUTRAL_ERROR_TEXTS[code] ?? GENERIC_ERROR_TEXT;
}
