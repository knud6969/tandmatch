// Anmeldelser (architecture 4.2, 8). Værdierne skal svare til enums price_accuracy og moderation_status i databasen.
export const PRICE_ACCURACY_VALUES = ["as_quoted", "slightly_higher", "much_higher"] as const;

// Svarmuligheder til "Svarede den endelige pris til prisoverslaget?" (8.2): præcis tre valg.
export const PRICE_ACCURACY_LABEL = {
  as_quoted: "Ja, prisen svarede til prisoverslaget",
  slightly_higher: "Nej, den endelige pris var lidt højere",
  much_higher: "Nej, den endelige pris var langt højere",
} as const satisfies Record<(typeof PRICE_ACCURACY_VALUES)[number], string>;

export const MODERATION_STATUSES = ["pending", "approved", "rejected"] as const;

// Prisnøjagtighed vises først fra så mange godkendte anmeldelser (SQL: public_clinic_review_stats_many, 8.3).
export const MIN_REVIEWS_FOR_PRICE_ACCURACY = 3;
