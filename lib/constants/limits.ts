// Lofter og grænser (architecture 7.6, 9.3, 6.6). Alle værdier er MVP-værdier.
export const CHAT_MAX_USER_MESSAGES_PER_CONVERSATION = 30;
export const CHAT_MAX_CHARS = 1000;
export const CHAT_MAX_DAILY_PER_PATIENT = 100;
export const CHAT_CONTEXT_MESSAGES = 20;
export const AI_TIMEOUT_MS = 30_000;

export const ANON_MAX_TOTAL_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_IMAGES_PER_REQUEST = 5;
export const MAX_IMAGE_UPLOAD_BYTES = 4 * 1024 * 1024;
export const MAX_IMAGE_DIMENSION = 2048;
// Tekstgrænser for opsummering og fri tekst (architecture 4.3, 10.4). Bruges af skemaer og UI.
export const SUMMARY_MAX_CHARS = 1500;
export const FREE_TEXT_MAX_CHARS = 2000;
export const SIGNED_URL_TTL_SECONDS = 300;
export const REQUEST_BUCKET = "request-images";

export const DEFAULT_MAX_DISTANCE_KM = 25;
export const REQUEST_EXPIRY_DAYS = 14;

// Oprydning af anonyme sessioner (architecture 7.7).
export const CLEANUP_BATCH_SIZE = 200;

// Beskedtråd (architecture 7.6, 10.7). Samme døgnloft er håndhævet i databasen (participant_messages_last_day()).
export const MESSAGE_MAX_CHARS = 2000;
export const MESSAGE_MAX_PER_DAY = 200;
