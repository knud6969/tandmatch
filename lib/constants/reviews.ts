// Anmeldelser (architecture 4.2, 8). Værdierne skal svare til enums price_accuracy og moderation_status i databasen.
export const PRICE_ACCURACY_VALUES = ["as_quoted", "slightly_higher", "much_higher"] as const;

// Svarmuligheder til "Svarede den endelige pris til prisoverslaget?" (8.2): præcis tre valg.
export const PRICE_ACCURACY_LABEL = {
  as_quoted: "Ja, prisen svarede til prisoverslaget",
  slightly_higher: "Nej, den endelige pris var lidt højere",
  much_higher: "Nej, den endelige pris var langt højere",
} as const satisfies Record<(typeof PRICE_ACCURACY_VALUES)[number], string>;

export const MODERATION_STATUSES = ["pending", "approved", "rejected"] as const;

// Moderationsstatus for anmeldelser og svar på dansk (architecture 8.5). Tonerne ligger i views/utils/review-status.ts.
export const MODERATION_LABEL = {
  pending: "Afventer godkendelse",
  approved: "Offentliggjort",
  rejected: "Afvist",
} as const satisfies Record<(typeof MODERATION_STATUSES)[number], string>;

// Prisnøjagtighed vises først fra så mange godkendte anmeldelser (SQL: public_clinic_review_stats_many, 8.3).
export const MIN_REVIEWS_FOR_PRICE_ACCURACY = 3;

// Længder og grænser for en anmeldelse og et svar (SQL: check-constraints på reviews og review_replies, architecture 4.3, 8.2).
export const REVIEW_TEXT_MIN_CHARS = 20;
export const REVIEW_TEXT_MAX_CHARS = 2000;
export const REVIEW_TRANSPARENCY_COMMENT_MAX_CHARS = 500;
export const REVIEW_REPLY_MAX_CHARS = 1000;
// Øvre grænse for den faktiske pris (samme loft som priserne på prislisten); databasen kræver kun >= 0.
export const REVIEW_ACTUAL_PRICE_MAX = 1_000_000;
