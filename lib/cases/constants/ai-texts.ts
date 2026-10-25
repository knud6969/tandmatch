import { EMERGENCY_CALL_NUMBER, OUT_OF_HOURS_HELP_TEXT } from "@/lib/leads/constants/emergency";
import type { ImageQuality, OutOfScopeTopic } from "@/lib/cases/types/ai";

// Faste danske tekster om AI’ens grænser. Skrevet i koden og ikke af modellen (architecture 7.3, 7.5).

// Åbningsbesked i chatten (vises af UI, skrevet i koden og ikke af modellen).
export const CHAT_WELCOME_TEXT =
  "Hej. Beskriv med dine egne ord, hvad du oplever, eller hvad du vil have lavet. Jeg kan ikke stille diagnoser eller sige, hvad det koster; klinikken vurderer.";

// Fast tekst over chatten om personoplysninger (maskeringen i features/cases/ai/pii.ts er kun et sikkerhedsnet).
export const CHAT_PII_WARNING_TEXT = "Skriv ikke dit navn, din adresse eller kontaktoplysninger.";

// Fast tekst over chatten.
export const AI_BOUNDARY_TEXT =
  "AI-assistenten giver ikke endelige vurderinger og kender ikke priserne. Klinikken vurderer.";

// Mærkat ved enhver foreløbig vurdering (architecture 7.3).
// MDR-TILPASNING: vises kun, når AI_RULES.allowPreliminaryAssessment er true.
export const PRELIMINARY_ASSESSMENT_LABEL = "Foreløbig – klinikken vurderer endeligt";

// Vises når patienten spørger om pris (architecture 7.3).
export const PRICE_NOTICE_TEXT =
  "AI-assistenten kender ikke priserne. Priserne kommer fra klinikkernes egne prislister i oversigten, og når du har sendt din sag, kan klinikken præcisere prisen. Du kan sortere klinikkerne efter pris i oversigten.";

// Vises når patienten spørger, hvilken klinik der er bedst.
export const CLINIC_RECOMMENDATION_NOTICE_TEXT =
  "AI-assistenten anbefaler ikke bestemte klinikker. Anmeldelser, pris, afstand og første ledige tid ser du for hver klinik i oversigten, hvor du selv kan sortere og sammenligne.";

export const OUT_OF_SCOPE_NOTICES: Record<OutOfScopeTopic, string> = {
  price: PRICE_NOTICE_TEXT,
  clinic_recommendation: CLINIC_RECOMMENDATION_NOTICE_TEXT,
};

// Fast akut-henvisning ved emergency (architecture 7.3). Appen viser den i akut-blokken med knappen "Jeg har ondt" (akutvejen).
export const EMERGENCY_REFERRAL_TEXT =
  "Det, du beskriver, kan kræve hurtig hjælp. Tryk på “Jeg har ondt” for at se klinikker med en ledig akuttid, og søg hjælp så hurtigt som muligt.";

// Ved livstruende tegn (vejrtrækningsbesvær, udbredt hævelse i ansigt eller hals).
export const LIFE_THREATENING_REFERRAL_TEXT =
  `Har du svært ved at trække vejret eller synke, eller er ansigt eller hals kraftigt hævet, så ring ${EMERGENCY_CALL_NUMBER} med det samme. ${OUT_OF_HOURS_HELP_TEXT}`;

// Fast tekst når AI-svaret blev afvist af filteret to gange (architecture 7.5, række 6).
export const CHAT_BLOCKED_TEXT =
  "Det kan jeg desværre ikke hjælpe med her. Prøv at formulere det anderledes, eller skriv din beskrivelse selv.";

// Fast tekst når kun AI-teksten blev afvist, men forslagene fra kataloget er gyldige (architecture 7.9a regel 3).
export const SUGGESTION_FALLBACK_TEXT =
  "Ud fra det, du har fortalt, kan behandlingerne nedenfor være relevante. Du vælger selv, og klinikken laver den endelige vurdering.";

export const CHAT_NOT_SHARED_TEXT =
  "Samtalen deles ikke med klinikker. Det er den opsummering, du godkender, der sendes.";

export const DESCRIPTION_LABEL = "Beskrivelse, ikke vurdering";

export const IMAGE_QUALITY_LABELS: Record<ImageQuality, string> = {
  ok: "God kvalitet",
  too_dark: "For mørkt",
  blurry: "Uskarpt",
  wrong_angle: "Forkert vinkel",
  not_teeth: "Viser ikke tænder",
};

// Fast svar, når AI-modellen ikke kan svare. Turen er brugt, og patientens besked er gemt (architecture 10.6).
export const CHAT_UNAVAILABLE_TEXT =
  "Jeg kunne ikke svare lige nu. Prøv at sende din besked igen om lidt, eller skriv din beskrivelse selv.";

// Når samtalen er lukket ved loftet (architecture 7.9). Kortene fortsætter.
export const CHAT_LIMIT_REACHED_TEXT =
  "Samtalen er slut. Du kan stadig vælge behandlinger og godkende din beskrivelse nedenfor.";
