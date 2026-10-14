// Guardrail-pipeline for én AI-tur (architecture 7.5, række 5 og 6). Ren logik: modelkaldet injiceres,
// så pipelinen kan testes uden OpenAI (tests/ai/guardrails.test.ts).
// Et svar, der fejler skema, filter eller kataloget, gensendes én gang med skærpet påmindelse.
// Fejler det igen, bruges en fast tekst fra koden (chat) eller patienten skriver selv (opsummering).
// Det afviste svar returneres og gemmes aldrig.

import {
  CHAT_BLOCKED_TEXT,
  EMERGENCY_REFERRAL_TEXT,
  LIFE_THREATENING_REFERRAL_TEXT,
} from "@/lib/constants/ai-texts";
import type { AiImageObservation, AiSummary, ImageQuality, OutOfScopeTopic } from "@/lib/types/ai";
import { AiInvalidOutputError, AiTimeoutError, AiUnavailableError } from "./errors";
import {
  detectEmergency,
  detectOutOfScopeTopics,
  findForbiddenCategories,
  isPhrasedAsPreliminary,
  mergeTopics,
  wordsOf,
  type ForbiddenCategory,
} from "./forbiddenTerms";
import { maskPii } from "./pii";
import { CHAT_RETRY_REMINDER } from "./prompts/chat.v2";
import { SUMMARY_RETRY_REMINDER } from "./prompts/summary.v2";
import type { AiRules } from "./rules";
import { chatTurnSchema, summaryModelSchema } from "./schemas";

export const MAX_AI_ATTEMPTS = 2;

// Kaldes med null ved første forsøg og med en påmindelse ved andet forsøg.
export type ModelCall = (retryReminder: string | null) => Promise<unknown>;

type History = { role: "user" | "assistant"; content: string }[];

function unique<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}

// ---------- Chat ----------

export type ChatGuardInput = {
  userMessage: string;
  rules: AiRules;
  knownSlugs: ReadonlySet<string>; // aktive slugs i kataloget
};

export type ChatGuardResult = {
  maskedUserMessage: string; // det der gemmes i ai_messages
  reply: string;
  preliminaryAssessment: string | null;
  suggestedServices: string[];
  emergency: boolean;
  lifeThreatening: boolean;
  outOfScopeTopics: OutOfScopeTopic[];
  readyForSummary: boolean;
  blocked: boolean;
};

function emergencyText(lifeThreatening: boolean): string {
  return lifeThreatening ? `${EMERGENCY_REFERRAL_TEXT} ${LIFE_THREATENING_REFERRAL_TEXT}` : EMERGENCY_REFERRAL_TEXT;
}

function textFilterOptions(rules: AiRules) {
  return { strictMdrMode: rules.strictMdrMode } as const;
}

export async function runChatGuard(input: ChatGuardInput, callModel: ModelCall): Promise<ChatGuardResult> {
  const { rules } = input;
  const maskedUserMessage = maskPii(input.userMessage);
  const detectedTopics = detectOutOfScopeTopics(maskedUserMessage, rules.blockedTopics);
  // Sikkerhedsnet uanset modellen og uanset reglerne (emergencyReferral er altid true).
  const detected = detectEmergency(maskedUserMessage);

  for (let attempt = 1; attempt <= MAX_AI_ATTEMPTS; attempt++) {
    let raw: unknown;
    try {
      raw = await callModel(attempt > 1 ? CHAT_RETRY_REMINDER : null);
    } catch (err) {
      if (err instanceof AiInvalidOutputError) continue;
      // Ved akutte tegn viser vi hellere den faste akut-henvisning end en fejl.
      if (detected.emergency && (err instanceof AiTimeoutError || err instanceof AiUnavailableError)) break;
      throw err;
    }

    const parsed = chatTurnSchema.safeParse(raw);
    if (!parsed.success) continue;
    const turn = parsed.data;

    // MDR-TILPASNING: slår rules.allowPreliminaryAssessment vurdering fra, tvinges feltet til null.
    const assessment = rules.allowPreliminaryAssessment ? turn.preliminaryAssessment : null;

    if (findForbiddenCategories(turn.reply, textFilterOptions(rules)).length > 0) continue;
    if (assessment !== null) {
      if (findForbiddenCategories(assessment, textFilterOptions(rules)).length > 0) continue;
      if (!isPhrasedAsPreliminary(assessment)) continue;
    }
    // Ukendte slugs afvises (7.5).
    if (turn.suggestedServices.some((slug) => !input.knownSlugs.has(slug))) continue;

    const emergency = turn.emergency || detected.emergency;
    const topics = mergeTopics(turn.outOfScopeTopics, detectedTopics).filter((t) => rules.blockedTopics.includes(t));
    if (emergency) {
      // Akut: ingen almindelig samtale. Ingen forslag, ingen vurdering, ingen opsummering.
      return {
        maskedUserMessage,
        reply: turn.reply,
        preliminaryAssessment: null,
        suggestedServices: [],
        emergency: true,
        lifeThreatening: detected.lifeThreatening,
        outOfScopeTopics: topics,
        readyForSummary: false,
        blocked: false,
      };
    }
    return {
      maskedUserMessage,
      reply: turn.reply,
      preliminaryAssessment: assessment,
      suggestedServices: unique(turn.suggestedServices),
      emergency: false,
      lifeThreatening: false,
      outOfScopeTopics: topics,
      readyForSummary: turn.readyForSummary,
      blocked: false,
    };
  }

  // Fast tekst fra koden. Det afviste svar bruges ikke.
  return {
    maskedUserMessage,
    reply: detected.emergency ? emergencyText(detected.lifeThreatening) : CHAT_BLOCKED_TEXT,
    preliminaryAssessment: null,
    suggestedServices: [],
    emergency: detected.emergency,
    lifeThreatening: detected.lifeThreatening,
    outOfScopeTopics: detectedTopics,
    readyForSummary: false,
    blocked: !detected.emergency,
  };
}

// ---------- Opsummering ----------

export type SummaryImageInput = { imageId: string; ref: string }; // ref er "img_1" …

export type SummaryGuardInput = {
  history: History;
  rules: AiRules;
  knownSlugs: ReadonlySet<string>;
  images: SummaryImageInput[];
};

export type SummaryGuardResult = {
  summary: AiSummary | null; // imageRef er case_images.id
  retakeImages: { imageId: string; reason: Exclude<ImageQuality, "ok"> }[]; // billeder der bør tages om
  outOfScopeTopics: OutOfScopeTopic[];
  fallback: "none" | "write_yourself";
};

const SUMMARY_TEXT_CATEGORIES: readonly ForbiddenCategory[] = ["price", "clinic_recommendation", "definitive", "assessment"];
const IMAGE_TEXT_CATEGORIES: readonly ForbiddenCategory[] = [
  "price",
  "clinic_recommendation",
  "definitive",
  "image_interpretation",
];

export async function runSummaryGuard(input: SummaryGuardInput, callModel: ModelCall): Promise<SummaryGuardResult> {
  const patientTexts = input.history.filter((m) => m.role === "user").map((m) => maskPii(m.content));
  const detected = mergeTopics(...patientTexts.map((t) => detectOutOfScopeTopics(t, input.rules.blockedTopics)));
  // Patientens egne ord og tal må genfortælles i tekstfelterne (fx et budget hun selv har nævnt), men ikke i billedfelterne.
  const allowTerms = unique(patientTexts.flatMap((t) => wordsOf(t)));
  const refToId = new Map(input.images.map((img) => [img.ref, img.imageId]));

  for (let attempt = 1; attempt <= MAX_AI_ATTEMPTS; attempt++) {
    let raw: unknown;
    try {
      raw = await callModel(attempt > 1 ? SUMMARY_RETRY_REMINDER : null);
    } catch (err) {
      // Upstream-fejl tæller som et fejlet forsøg. Opsummeringen falder tilbage til patientens egen tekst.
      if (err instanceof AiInvalidOutputError || err instanceof AiTimeoutError || err instanceof AiUnavailableError) continue;
      throw err;
    }

    const parsed = summaryModelSchema.safeParse(raw);
    if (!parsed.success) continue;
    const draft = parsed.data;

    if (draft.suggestedServices.some((slug) => !input.knownSlugs.has(slug))) continue;

    // Billedreferencer skal præcis matche de billeder, der blev sendt.
    const refs = draft.images.map((img) => img.imageRef);
    const refsOk = refs.length === input.images.length && new Set(refs).size === refs.length && refs.every((r) => refToId.has(r));
    if (!refsOk) continue;

    const textFields = [draft.summaryText, ...draft.patientWishes, ...draft.patientReportedHistory].join(" ");
    const textHits = findForbiddenCategories(textFields, {
      categories: SUMMARY_TEXT_CATEGORIES,
      strictMdrMode: input.rules.strictMdrMode,
      allowTerms,
    });
    if (textHits.length > 0) continue;

    const imageProblem = draft.images.some(
      (img) =>
        findForbiddenCategories([img.visibleArea, ...img.observations].join(" "), {
          categories: IMAGE_TEXT_CATEGORIES,
          strictMdrMode: input.rules.strictMdrMode,
        }).length > 0,
    );
    if (imageProblem) continue;

    const images: AiImageObservation[] = draft.images.map((img) => ({
      imageRef: refToId.get(img.imageRef) as string,
      view: img.view,
      visibleArea: img.visibleArea,
      observations: img.observations,
      quality: img.quality,
    }));
    const outOfScopeTopics = mergeTopics(draft.outOfScopeTopics, detected).filter((t) => input.rules.blockedTopics.includes(t));
    const retakeImages = images
      .filter((img) => img.quality !== "ok")
      .map((img) => ({ imageId: img.imageRef, reason: img.quality as Exclude<ImageQuality, "ok"> }));

    return {
      summary: {
        summaryText: draft.summaryText,
        patientWishes: draft.patientWishes,
        patientReportedHistory: draft.patientReportedHistory,
        suggestedServices: unique(draft.suggestedServices),
        images,
        outOfScopeTopics,
      },
      retakeImages,
      outOfScopeTopics,
      fallback: "none",
    };
  }

  return { summary: null, retakeImages: [], outOfScopeTopics: detected, fallback: "write_yourself" };
}
