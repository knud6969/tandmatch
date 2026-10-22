// AI-reglerne ét sted (architecture 7.8). Prompts, skemaer, guard og UI-tekster læser kun herfra.
// Ren fil uden server-imports. Services får reglerne i constructoren, så de kan strammes uden at
// røre controllers, routes eller UI.

import type { OutOfScopeTopic } from "@/lib/cases/types/ai";

export type AiRules = {
  version: string; // gemmes på samtalen og sagen for sporbarhed
  // false: feltet preliminaryAssessment tvinges til null, og prompten forbyder vurdering.
  allowPreliminaryAssessment: boolean;
  // false: prompten tillader kun neutrale beskrivelser fra kataloget, ingen forklaring af forløb.
  allowTreatmentExplanation: boolean;
  // true: diagnose- og alvorlighedsord blokeres (mdrStrictTerms i forbiddenTerms.ts).
  strictMdrMode: boolean;
  // Emner, AI'en aldrig besvarer. Registreres i outOfScopeTopics, og UI viser en fast tekst.
  blockedTopics: readonly OutOfScopeTopic[];
  // Altid true: akut henvisning gælder uanset MDR. Typen tillader ikke false.
  emergencyReferral: true;
  // EMERGENCY_REFERRAL_IN_CHAT. true (standard): akut-henvisning i chatten (prompt, guardens nødtekst, 112/1813).
  // false: ingen henvisning i AI'ens svar; emergency beregnes stadig (guard.emergencyDetected) men vises ikke.
  // MIDLERTIDIG AFVIGELSE fra akut-reglen i CLAUDE.md, hvis false (se architecture 7.9). Slås til igen ved at sætte true.
  emergencyReferralInChat: boolean;
};

// MDR-TILPASNING (UDSKUDT, architecture 7.3): prototypen tillader foreløbig vurdering og forklaring.
// Før rigtige patienter skal det vurderes fagligt. Stramning sker her og i prompt-versionen
// (prompts/chat.v4.ts, summary.v2.ts), uden ændringer i controllers, routes eller UI.
export const AI_RULES: AiRules = Object.freeze<AiRules>({
  version: "rules-v4",
  allowPreliminaryAssessment: true,
  allowTreatmentExplanation: true,
  strictMdrMode: false,
  blockedTopics: ["price", "clinic_recommendation"],
  emergencyReferral: true,
  // Midlertidigt slået fra efter brugerens beslutning 2026-10-19 (architecture 7.9, security.md kompromis 29). Sæt til true
  // for igen at vise akut-henvisning (akut tid, 112, 1813) i chatten, som CLAUDE.md kræver før rigtige patienter.
  emergencyReferralInChat: false,
});

// Færdig stram konfiguration til MDR: kun neutrale beskrivelser, ingen vurdering, diagnoseord blokeret.
// Bruges ved at give den til AiChatService/AiSummaryService i stedet for AI_RULES.
export const MDR_STRICT_RULES: AiRules = Object.freeze<AiRules>({
  ...AI_RULES,
  version: "rules-v4-mdr-strict",
  allowPreliminaryAssessment: false,
  allowTreatmentExplanation: false,
  strictMdrMode: true,
});
