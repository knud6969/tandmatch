// Delte AI-typer (architecture 7.4). Skemaerne er strict: ingen felter for diagnose, alvorlighed, behandling eller pris.
export type OutOfScopeTopic = "diagnosis" | "severity" | "treatment" | "price";

// Chat: ét svar pr. patientbesked
export type AiChatTurn = {
  reply: string; // max 700 tegn
  outOfScopeTopics: OutOfScopeTopic[];
  readyForSummary: boolean; // aktiverer kun en knap
};

export type ImageView = "front" | "upper" | "lower" | "side_left" | "side_right" | "unclear";
export type ImageQuality = "ok" | "too_dark" | "blurry" | "wrong_angle" | "not_teeth";

export type AiImageObservation = {
  imageRef: string; // case_images.id på serveren (intern "img_n" mappes før lagring)
  view: ImageView;
  visibleArea: string; // max 80 tegn
  observations: string[]; // max 4, hver max 120 tegn
  quality: ImageQuality;
};

// Opsummering (udkast). Patienten godkender altid før tandlæger ser den.
export type AiSummary = {
  summaryText: string; // max 800 tegn
  patientWishes: string[]; // max 5
  patientReportedHistory: string[]; // max 5
  images: AiImageObservation[];
  outOfScopeTopics: OutOfScopeTopic[];
};
