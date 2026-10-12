// Lofter og grænser (architecture 7.6, 9.3). Alle værdier er MVP-værdier.
// Værdier markeret (SQL) spejler databasen og ændres begge steder i samme commit.
export const CHAT_MAX_USER_MESSAGES_PER_CONVERSATION = 30;
export const CHAT_MAX_CHARS = 1000;
export const CHAT_MAX_DAILY_PER_PATIENT = 100;
export const CHAT_CONTEXT_MESSAGES = 20;
export const AI_TIMEOUT_MS = 30_000;
export const MAX_SUMMARIES_PER_CASE = 5;
export const MAX_SUMMARIES_PER_PATIENT_PER_DAY = 20;
export const MAX_CONFIRMED_SERVICES_PER_CASE = 5;

export const ANON_MAX_TOTAL_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_IMAGES_PER_CASE = 5;
export const MAX_IMAGE_UPLOAD_BYTES = 4 * 1024 * 1024;
export const MAX_IMAGE_DIMENSION = 2048;
export const SIGNED_URL_TTL_SECONDS = 300;

// Leads pr. sag (SQL: send_leads(), trigger på leads).
export const MAX_ACTIVE_LEADS_PER_CASE = 3;
export const MAX_TOTAL_LEADS_PER_CASE = 10;

// Oprydning af anonyme sessioner (architecture 7.7).
export const CLEANUP_BATCH_SIZE = 200;

// Beskedtråd (architecture 7.6). Samme døgnloft er håndhævet i databasen.
export const MESSAGE_MAX_CHARS = 2000;
export const MESSAGE_MAX_PER_DAY = 200;
