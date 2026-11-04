// Web push til klinikejerens browser (platform 14). Loftet skal svare til register_web_push_subscription()
// i supabase/migrations/20261105000200_notification_outbox.sql.
export const MAX_WEB_PUSH_SUBSCRIPTIONS_PER_USER = 10; // (SQL)

// Browserens push-tjenester: Google (Chrome), Mozilla (Firefox), Apple (Safari) og Microsoft (Edge). Serveren sender kun
// til disse værter, så et abonnement ikke kan få den til at kalde en vilkårlig adresse (SSRF).
export const WEB_PUSH_ALLOWED_HOST_SUFFIXES = [
  "fcm.googleapis.com",
  "android.googleapis.com",
  "push.services.mozilla.com",
  "push.apple.com",
  "notify.windows.com",
] as const;

// Længder på nøglerne som base64url uden udfyldning: 65 bytes (p256dh) og 16 bytes (auth). (SQL: check)
export const WEB_PUSH_P256DH_PATTERN = /^[A-Za-z0-9_-]{87}$/;
export const WEB_PUSH_AUTH_PATTERN = /^[A-Za-z0-9_-]{22}$/;
export const WEB_PUSH_ENDPOINT_MAX_CHARS = 500; // (SQL)
