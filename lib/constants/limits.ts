// Lofter og grænser (architecture 7.6, 9.3). Alle værdier er MVP-værdier.
// Værdier markeret (SQL) spejler databasen og ændres begge steder i samme commit.
export const CHAT_MAX_USER_MESSAGES_PER_CONVERSATION = 30; // (SQL) ai_limits.chat_messages_per_conversation og ai_messages_after_insert()
export const CHAT_MAX_CHARS = 1000; // (SQL) ai_limits.chat_message_max_chars
export const CHAT_MAX_DAILY_PER_PATIENT = 100; // (SQL) ai_limits.chat_messages_per_patient_day (tælles i ai_patient_usage_daily)
// AI-kald pr. anonym bruger pr. døgn, så én bruger ikke kan tømme det globale loft. ai_limits.anon_user_daily_ai_calls.
export const ANON_MAX_DAILY_AI_CALLS_PER_USER = 40; // (SQL)
// Rate limit pr. IP pr. time på chat og opsummering (architecture 7.6). Chatten har brug for mere end de 10 forsøg pr. time,
// som login og kontooprettelse har, fordi en samtale kan have op til 30 beskeder.
export const CHAT_IP_LIMIT_PER_HOUR = 120;
export const SUMMARY_IP_LIMIT_PER_HOUR = 20;
export const CHAT_CONTEXT_MESSAGES = 20;
export const AI_TIMEOUT_MS = 30_000;
// (SQL) cases.summary_text og approve_summary(): patientens godkendte opsummering.
export const SUMMARY_MAX_CHARS = 1500;
// (SQL) case_images.ai_description: billedbeskrivelsen afkortes til dette, før den gemmes.
export const IMAGE_DESCRIPTION_MAX_CHARS = 500;
// Andelen af patientens ord, der skal findes i AI-udkastet, for at teksten regnes som bygget på det (lib/domain/summary.ts).
export const AI_DRAFT_MIN_SHARED_WORDS = 0.5;
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
// Leads pr. patient pr. rullende døgn på tværs af sager og status. Spejler triggeren leads_daily_limit().
export const MAX_LEADS_PER_PATIENT_DAY = 15;
// Rate limit pr. IP pr. time på afsendelse af leads (architecture 7.6).
export const LEADS_SEND_IP_LIMIT_PER_HOUR = 30;

// Rate limit pr. IP pr. time på POST /api/leads/{id}/booking (architecture 7.6, security trin 6 M1).
export const BOOKING_IP_LIMIT_PER_HOUR = 30;

// Oprydning af anonyme sessioner (architecture 7.7).
export const CLEANUP_BATCH_SIZE = 200;

// Beskedtråd (architecture 7.6). Samme døgnloft er håndhævet i databasen.
export const MESSAGE_MAX_CHARS = 2000;
export const MESSAGE_MAX_PER_DAY = 200;
