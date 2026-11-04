import { WEB_PUSH_ALLOWED_HOST_SUFFIXES, WEB_PUSH_ENDPOINT_MAX_CHARS } from "@/lib/clinics/constants/web-push";

// Er adressen en https-adresse hos en kendt push-tjeneste? Bruges ved registrering og igen lige før afsendelse.
export function isAllowedWebPushEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== "string" || endpoint.length > WEB_PUSH_ENDPOINT_MAX_CHARS) return false;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "" || url.port !== "") return false;
  const host = url.hostname.toLowerCase();
  return WEB_PUSH_ALLOWED_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}
