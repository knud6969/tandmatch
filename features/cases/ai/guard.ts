// Guardrail-pipeline for én AI-tur (architecture 7.5, række 5 og 6). Ren logik: modelkaldet injiceres,
// så pipelinen kan testes uden OpenAI (tests/ai/guardrails.test.ts).
// Et svar, der fejler skema, filter eller kataloget, gensendes én gang med skærpet påmindelse.
// Fejler det igen, bruges en fast tekst fra koden (chat) eller patienten skriver selv (opsummering).
// Det afviste svar returneres og gemmes aldrig.

import {
  CHAT_BLOCKED_TEXT,
  EMERGENCY_REFERRAL_TEXT,
  LIFE_THREATENING_REFERRAL_TEXT,
} from "@/lib/cases/constants/ai-texts";
import type { AiImageObservation, AiSummary, ImageQuality, OutOfScopeTopic } from "@/lib/cases/types/ai";
import { AiInvalidOutputError, AiTimeoutError, AiUnavailableError } from "./errors";
import {
  DEFAULT_CATEGORIES,
  REPLY_CATEGORIES,
  detectEmergency,
  filterQuickReplies,
  hasStrongEmergencyWord,
  detectOutOfScopeTopics,
  findForbiddenCategories,
  isPhrasedAsPreliminary,
  mergeTopics,
  type ForbiddenCategory,
} from "./forbiddenTerms";
import { maskPii } from "./pii";
import { CHAT_RETRY_REMINDER } from "./prompts/chat.v4";
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
  emergency: boolean; // det der vises (false, når rules.emergencyReferralInChat er slået fra)
  emergencyDetected: boolean; // beregnet internt uanset indstillingen
  lifeThreatening: boolean;
  outOfScopeTopics: OutOfScopeTopic[];
  readyForSummary: boolean;
  quickReplies: string[]; // hurtigsvar (7.4); gemmes ikke
  blocked: boolean;
};

function emergencyText(lifeThreatening: boolean): string {
  return lifeThreatening ? `${EMERGENCY_REFERRAL_TEXT} ${LIFE_THREATENING_REFERRAL_TEXT}` : EMERGENCY_REFERRAL_TEXT;
}

// Svar til patienten (reply): vurderinger hører kun hjemme i preliminaryAssessment (K2).
function replyFilterOptions(rules: AiRules) {
  return { categories: REPLY_CATEGORIES, strictMdrMode: rules.strictMdrMode } as const;
}

// Den foreløbige vurdering selv: vurderingsord er tilladt her, resten gælder som altid.
function assessmentFilterOptions(rules: AiRules) {
  return { categories: DEFAULT_CATEGORIES, strictMdrMode: rules.strictMdrMode } as const;
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
      if (detected.emergency && rules.emergencyReferralInChat && (err instanceof AiTimeoutError || err instanceof AiUnavailableError)) break;
      throw err;
    }

    const parsed = chatTurnSchema.safeParse(raw);
    if (!parsed.success) continue;
    const turn = parsed.data;

    // MDR-TILPASNING: slår rules.allowPreliminaryAssessment vurdering fra, tvinges feltet til null.
    const assessment = rules.allowPreliminaryAssessment ? turn.preliminaryAssessment : null;

    if (findForbiddenCategories(turn.reply, replyFilterOptions(rules)).length > 0) continue;
    if (assessment !== null) {
      if (findForbiddenCategories(assessment, assessmentFilterOptions(rules)).length > 0) continue;
      if (!isPhrasedAsPreliminary(assessment)) continue;
    }
    // Ukendte slugs afvises (7.5).
    if (turn.suggestedServices.some((slug) => !input.knownSlugs.has(slug))) continue;

    // 8.11e: et model-flag alene udløser kun akut, hvis patientens tekst har et stærkt tegn. Mild tandpine er ikke akut.
    const modelEmergency = turn.emergency && hasStrongEmergencyWord(maskedUserMessage);
    const emergency = modelEmergency || detected.emergency;
    const topics = mergeTopics(turn.outOfScopeTopics, detectedTopics).filter((t) => rules.blockedTopics.includes(t));
    if (emergency && rules.emergencyReferralInChat) {
      // Akut: ingen almindelig samtale. Ingen forslag, ingen vurdering, ingen opsummering.
      // Fanger detektionen akut, men modellen ikke, erstattes svaret af den faste henvisning, så der ikke står
      // almindelige spørgsmål ved siden af (B1).
      return {
        maskedUserMessage,
        reply: modelEmergency ? turn.reply : emergencyText(detected.lifeThreatening),
        preliminaryAssessment: null,
        suggestedServices: [],
        emergency: true,
        emergencyDetected: true,
        lifeThreatening: detected.lifeThreatening,
        outOfScopeTopics: topics,
        readyForSummary: false,
        quickReplies: [],
        blocked: false,
      };
    }
    return {
      maskedUserMessage,
      reply: turn.reply,
      preliminaryAssessment: assessment,
      suggestedServices: unique(turn.suggestedServices),
      // Slået fra: flaget beregnes, men vises ikke og ingen henvisningstekst indsættes (rules.ts).
      emergency: false,
      emergencyDetected: emergency,
      lifeThreatening: false,
      outOfScopeTopics: topics,
      // 7.9: uden forslag er der intet for patienten at bekræfte.
      readyForSummary: turn.readyForSummary && unique(turn.suggestedServices).length > 0,
      // 8.6g: ved fund droppes kun hurtigsvarene, ikke hele svaret. Ingen hurtigsvar, når patienten skal bekræfte ydelser.
      quickReplies:
        turn.readyForSummary && unique(turn.suggestedServices).length > 0
          ? []
          : filterQuickReplies(turn.quickReplies, replyFilterOptions(rules)),
      blocked: false,
    };
  }

  // Fast tekst fra koden. Det afviste svar bruges ikke.
  const showEmergency = detected.emergency && rules.emergencyReferralInChat;
  return {
    maskedUserMessage,
    reply: showEmergency ? emergencyText(detected.lifeThreatening) : CHAT_BLOCKED_TEXT,
    preliminaryAssessment: null,
    suggestedServices: [],
    emergency: showEmergency,
    emergencyDetected: detected.emergency,
    lifeThreatening: showEmergency && detected.lifeThreatening,
    outOfScopeTopics: detectedTopics,
    readyForSummary: false,
    quickReplies: [],
    blocked: !showEmergency,
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

const SUMMARY_TEXT_CATEGORIES: readonly ForbiddenCategory[] = [
  "price",
  "clinic_recommendation",
  "definitive",
  "assessment",
  "speculation",
];
const WITHOUT_PRICE: readonly ForbiddenCategory[] = SUMMARY_TEXT_CATEGORIES.filter((c) => c !== "price");
const IMAGE_TEXT_CATEGORIES: readonly ForbiddenCategory[] = [
  "price",
  "clinic_recommendation",
  "definitive",
  "image_interpretation",
];

// K3: patientens ord åbner kun for kategorien "price", og kun for udsagn i patientWishes, der (normaliseret) er en
// ordret delstreng af én af patientens egne beskeder (fx "Højst 5000 kr."). Ord, der findes spredt i samtalen, er ikke nok:
// "Min veninde betalte 5000 kr for facader" giver ikke "Facader for 5000 kr". Klinik-, endelige, vurderings- og
// diagnoseord kontrolleres altid, uanset hvad patienten skrev.
function normalizeForQuote(text: string): string {
  return (text.toLowerCase().match(/[\p{L}\d]+(?:[.,]\d+)*/gu) ?? []).join(" ");
}

function isPatientsOwnWords(statement: string, patientMessages: readonly string[]): boolean {
  const normalized = normalizeForQuote(statement);
  if (normalized === "") return false;
  return patientMessages.some((message) => ` ${message} `.includes(` ${normalized} `));
}

export async function runSummaryGuard(input: SummaryGuardInput, callModel: ModelCall): Promise<SummaryGuardResult> {
  const patientTexts = input.history.filter((m) => m.role === "user").map((m) => maskPii(m.content));
  const detected = mergeTopics(...patientTexts.map((t) => detectOutOfScopeTopics(t, input.rules.blockedTopics)));
  const patientMessages = patientTexts.map(normalizeForQuote);
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

    const checked = (text: string, categories: readonly ForbiddenCategory[]) =>
      findForbiddenCategories(text, { categories, strictMdrMode: input.rules.strictMdrMode }).length > 0;
    const textProblem =
      checked(draft.summaryText, SUMMARY_TEXT_CATEGORIES) ||
      draft.patientReportedHistory.some((text) => checked(text, SUMMARY_TEXT_CATEGORIES)) ||
      draft.patientWishes.some((text) =>
        checked(text, isPatientsOwnWords(text, patientMessages) ? WITHOUT_PRICE : SUMMARY_TEXT_CATEGORIES),
      );
    if (textProblem) continue;

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
