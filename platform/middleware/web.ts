import "server-only";
import { WEB_ONLY_TEXT } from "@/lib/common/constants/error-texts";
import { isTokenTransport } from "@/platform/db/supabase";
import { ApiError } from "@/platform/middleware/http";

// Routes, der kun giver mening med cookies (glemt adgangskode, skift af login): appen (bearer eller
// X-TandMatch-Client: mobile) afvises med 400, før noget andet sker (architecture 10.2).
export function requireWebClient(req: Request): void {
  if (isTokenTransport(req.headers)) {
    throw new ApiError(400, "VALIDATION_ERROR", WEB_ONLY_TEXT);
  }
}

// Origin til links i e-mails (nulstilling, bekræftelse af ny e-mail). Bygges kun af serveren, aldrig ud fra klientens
// input: SITE_URL, hvis den er sat (kun http/https), ellers requestens egen origin. Supabase afviser desuden
// redirect-URL'er, der ikke står på projektets liste (Site URL / Redirect URLs).
export function siteOrigin(req: Request, configured: string | undefined = process.env.SITE_URL): string {
  const value = configured?.trim();
  const url = new URL(value ? value : req.url);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("SITE_URL skal være en http(s)-adresse");
  }
  return url.origin;
}
