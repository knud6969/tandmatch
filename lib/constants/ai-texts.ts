import type { ImageQuality, OutOfScopeTopic } from "@/lib/types/ai";

// Faste danske tekster om AI’ens grænser. Skrevet i koden og ikke af modellen (architecture 7.3, 7.5).

// Åbningsbesked i chatten (vises af UI, skrevet i koden og ikke af modellen).
export const CHAT_WELCOME_TEXT =
  "Hej. Beskriv med dine egne ord, hvad du oplever, eller hvad du gerne vil have lavet, fx hvor det sidder, og hvor længe du har haft det. Jeg hjælper dig med at sætte ord på det, så klinikkerne forstår dit behov. Jeg kan ikke stille diagnoser eller sige, hvad det koster.";

// Fast tekst over chatten om personoplysninger (maskeringen i services/ai/pii.ts er kun et sikkerhedsnet).
export const CHAT_PII_WARNING_TEXT = "Skriv ikke dit navn, din adresse eller kontaktoplysninger.";

// Overskrift på mærkatet ved en foreløbig vurdering, og den forklarende tekst under (AiDisclaimer).
export const PRELIMINARY_ASSESSMENT_TITLE = "Foreløbig vurdering fra AI";
export const AI_DISCLAIMER_TEXT =
  "AI-assistenten kan forklare og give en foreløbig vurdering ud fra det, du skriver. Den er ikke en diagnose og ikke en garanti. Klinikken laver den endelige vurdering.";

// Fast tekst over chatten.
export const AI_BOUNDARY_TEXT =
  "AI-assistenten giver ikke endelige vurderinger og kender ikke priserne. Klinikken vurderer.";

// Mærkat ved enhver foreløbig vurdering (architecture 7.3).
// MDR-TILPASNING: vises kun, når AI_RULES.allowPreliminaryAssessment er true.
export const PRELIMINARY_ASSESSMENT_LABEL = "Foreløbig vurdering fra AI. Klinikken laver den endelige vurdering.";

// Vises når patienten spørger om pris (architecture 7.3).
export const PRICE_NOTICE_TEXT =
  "Priserne kommer fra klinikkernes egne prislister, og du kan sortere klinikkerne efter pris, anmeldelser, afstand og første ledige tid i oversigten.";

// Vises når patienten spørger, hvilken klinik der er bedst.
export const CLINIC_RECOMMENDATION_NOTICE_TEXT =
  "AI-assistenten anbefaler ikke bestemte klinikker. I oversigten kan du sammenligne klinikkerne efter pris, anmeldelser, afstand og første ledige tid.";

export const OUT_OF_SCOPE_NOTICES: Record<OutOfScopeTopic, string> = {
  price: PRICE_NOTICE_TEXT,
  clinic_recommendation: CLINIC_RECOMMENDATION_NOTICE_TEXT,
};

// Fast akut-henvisning ved emergency (architecture 7.3). UI viser den med link til /akut.
export const EMERGENCY_REFERRAL_TEXT =
  "Det, du beskriver, kan kræve hurtig hjælp. Søg en akut tid eller kontakt tandlægevagten så hurtigt som muligt. Du kan finde akutte tider under Akut.";

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
