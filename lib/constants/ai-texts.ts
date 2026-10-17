import type { ImageQuality, OutOfScopeTopic } from "@/lib/types/ai";

// Faste danske tekster om AI’ens grænser. Skrevet i koden og ikke af modellen (architecture 7.3, 7.5).

// Åbningsbesked i chatten (vises af UI, skrevet i koden og ikke af modellen).
export const CHAT_WELCOME_TEXT =
  "Hej. Beskriv med dine egne ord, hvad du oplever, eller hvad du gerne vil have lavet, fx hvor det sidder, og hvor længe du har haft det. Jeg hjælper dig med at sætte ord på det, så klinikkerne forstår dit behov. Jeg kan ikke stille diagnoser eller sige, hvad det koster.";

// Fast tekst over chatten om personoplysninger (maskeringen i services/ai/pii.ts er kun et sikkerhedsnet).
export const CHAT_PII_WARNING_TEXT = "Skriv ikke dit navn, din adresse eller kontaktoplysninger.";

// Fast tekst over chatten.
export const AI_BOUNDARY_TEXT =
  "AI-assistenten giver ikke endelige vurderinger og kender ikke priserne. Klinikken vurderer.";

// Mærkat ved enhver foreløbig vurdering (architecture 7.3).
// MDR-TILPASNING: vises kun, når AI_RULES.allowPreliminaryAssessment er true.
export const PRELIMINARY_ASSESSMENT_LABEL = "Foreløbig vurdering fra AI. Klinikken laver den endelige vurdering.";

// Vises når patienten spørger om pris (architecture 7.3).
export const PRICE_NOTICE_TEXT =
  "AI-assistenten kender ikke priserne. Priserne kommer fra klinikkernes egne prislister i oversigten, og når du har sendt din forespørgsel, giver klinikkerne selv et prisinterval og første ledige tid. Du kan sortere klinikkerne efter pris i oversigten.";

// Vises når patienten spørger, hvilken klinik der er bedst.
export const CLINIC_RECOMMENDATION_NOTICE_TEXT =
  "AI-assistenten anbefaler ikke bestemte klinikker. Anmeldelser, pris, afstand og første ledige tid ser du for hver klinik i oversigten, hvor du selv kan sortere og sammenligne.";

export const OUT_OF_SCOPE_NOTICES: Record<OutOfScopeTopic, string> = {
  price: PRICE_NOTICE_TEXT,
  clinic_recommendation: CLINIC_RECOMMENDATION_NOTICE_TEXT,
};

// Fast akut-henvisning ved emergency (architecture 7.3). UI viser den i akut-blokken med link til /klinikker?akut=1.
export const EMERGENCY_REFERRAL_TEXT =
  "Det, du beskriver, kan kræve hurtig hjælp. Søg en akut tid eller kontakt tandlægevagten så hurtigt som muligt. Du kan se klinikker med akutte tider i oversigten.";

// Ved livstruende tegn (vejrtrækningsbesvær, udbredt hævelse i ansigt eller hals).
export const LIFE_THREATENING_REFERRAL_TEXT =
  "Har du svært ved at trække vejret eller synke, eller er ansigt eller hals kraftigt hævet, så ring 112 med det samme. Ellers kan du ringe til lægevagten på 1813 eller søge en akut tandlægetid.";

// Fast tekst når AI-svaret blev afvist af filteret to gange (architecture 7.5, række 6).
export const CHAT_BLOCKED_TEXT =
  "Det kan jeg desværre ikke hjælpe med her. Prøv at formulere det anderledes, eller skriv din beskrivelse selv.";

export const CHAT_NOT_SHARED_TEXT =
  "Samtalen deles ikke med tandlæger. Det er den opsummering, du godkender, der sendes.";

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
