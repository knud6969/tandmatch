// Guardrail-pipeline for én AI-tur (architecture 7.5). Ren logik: modelkaldet injiceres,
// så pipelinen kan testes uden OpenAI (tests/ai/guardrails.test.ts).
// Regel: et AI-svar, der fejler validering eller indeholder forbudt indhold, gensendes én gang med skærpet påmindelse.
// Fejler det igen, bruges en fast tekst fra koden (chat) eller patienten skriver selv (opsummering).

import type { AiImageObservation, AiSummary, ImageQuality, OutOfScopeTopic } from "@/lib/types/ai";
import { AiInvalidOutputError, AiTimeoutError, AiUnavailableError } from "./errors";
import { maskPii } from "./pii";
import { detectOutOfScopeTopics, findForbiddenCategories, isEchoableWord, mergeTopics, wordsOf } from "./forbiddenTerms";
import type { z, ZodType } from "zod";
import { chatTurnSchema, summaryModelSchema } from "./schemas";
import { CHAT_RETRY_REMINDER } from "./prompts/chat.v1";
import { SUMMARY_RETRY_REMINDER } from "./prompts/summary.v1";

// Fast dansk tekst, skrevet af koden og ikke af modellen (architecture 7.5, række 6).
export const CHAT_BLOCKED_TEXT =
  "Det kan jeg desværre ikke hjælpe med. Prøv at formulere det anderledes, eller skriv din beskrivelse selv.";

export const MAX_AI_ATTEMPTS = 2;

// Synlige og anatomiske ord, der må bruges i billedbeskrivelser, også når patienten selv har skrevet dem.
// Blokeringen rammer patientens påstande (fx "skæve", "skadet"), ikke almindelig beskrivelse af det synlige.
// Vurderinger fanges af findForbiddenCategories på billedteksten.
const NEUTRAL_WORDS = new Set([
  "tænder", "tanden", "tanderne", "tandkød", "tandkødet", "overmund", "undermund", "fortænder",
  "fortænderne", "kindtænder", "hjørnetænder", "mund", "læber", "venstre", "højre", "forfra", "siden", "billede",
  "mellemrum", "placering", "farve", "farven", "form", "kategori", "område", "øverste", "nederste",
  "synlig", "synlige", "lys", "lyse", "mørk", "mørke", "gul", "gule", "gult", "gullig", "gullige",
]);

type History = { role: "user" | "assistant"; content: string }[];
type Answers = Record<string, string | string[]>;

// Kaldes med null ved første forsøg og med en påmindelse ved andet forsøg.
export type ModelCall = (retryReminder: string | null) => Promise<unknown>;

function answerTexts(answers: Answers): string[] {
  return Object.values(answers).flatMap((v) => (Array.isArray(v) ? v : [v]));
}

function parse<T extends ZodType>(schema: T, raw: unknown): z.output<T> | null {
  const result = schema.safeParse(raw);
  return result.success ? result.data : null;
}

// ---------- Chat ----------

export type ChatGuardInput = {
  category: string;
  answers: Answers;
  history: History;
  userMessage: string;
};

export type ChatGuardResult = {
  maskedUserMessage: string; // det der gemmes i ai_messages
  reply: string;
  outOfScopeTopics: OutOfScopeTopic[];
  readyForSummary: boolean;
  blocked: boolean;
};

export async function runChatGuard(input: ChatGuardInput, callModel: ModelCall): Promise<ChatGuardResult> {
  const maskedUserMessage = maskPii(input.userMessage);
  const detected = detectOutOfScopeTopics(maskedUserMessage);

  // Patientens egne ord og kategorien må gentages i svaret, men ikke ord der selv er emner (fx "karies", "pris").
  const allowTerms = [
    ...wordsOf(maskedUserMessage),
    ...wordsOf(input.category),
    ...answerTexts(input.answers).flatMap((t) => wordsOf(t)),
  ].filter(isEchoableWord);

  for (let attempt = 1; attempt <= MAX_AI_ATTEMPTS; attempt++) {
    let raw: unknown;
    try {
      raw = await callModel(attempt > 1 ? CHAT_RETRY_REMINDER : null);
    } catch (err) {
      // Ugyldigt format gensendes. Timeout og nedbrud kastes videre til routen (503).
      if (err instanceof AiInvalidOutputError) continue;
      throw err;
    }
    const turn = parse(chatTurnSchema, raw);
    if (!turn) continue;
    if (findForbiddenCategories(turn.reply, allowTerms).length > 0) continue;
    return {
      maskedUserMessage,
      reply: turn.reply,
      outOfScopeTopics: mergeTopics(turn.outOfScopeTopics, detected),
      readyForSummary: turn.readyForSummary,
      blocked: false,
    };
  }

  return {
    maskedUserMessage,
    reply: CHAT_BLOCKED_TEXT,
    outOfScopeTopics: detected,
    readyForSummary: false,
    blocked: true,
  };
}

// ---------- Opsummering ----------

export type SummaryImageInput = { imageId: string; ref: string };

export type SummaryGuardInput = {
  category: string;
  answers: Answers;
  freeText: string | null;
  history: History;
  images: SummaryImageInput[];
};

export type SummaryGuardResult = {
  summary: AiSummary | null; // imageRef er request_images.id
  retakeImages: { imageId: string; reason: Exclude<ImageQuality, "ok"> }[];
  outOfScopeTopics: OutOfScopeTopic[];
  fallback: "none" | "write_yourself";
};

export async function runSummaryGuard(input: SummaryGuardInput, callModel: ModelCall): Promise<SummaryGuardResult> {
  const patientTexts = [
    ...input.history.filter((m) => m.role === "user").map((m) => maskPii(m.content)),
    ...(input.freeText ? [maskPii(input.freeText)] : []),
    input.category,
    ...answerTexts(input.answers),
  ];
  const detected = mergeTopics(...patientTexts.map((t) => detectOutOfScopeTopics(t)));

  // Patientens ord må bruges i tekst-felterne (genfortælling), men ikke i billedbeskrivelser (architecture 7.5, række 5).
  const allowTerms = patientTexts.flatMap((t) => wordsOf(t)).filter(isEchoableWord);
  const forbiddenInImages = new Set(
    patientTexts.flatMap((t) => wordsOf(t, 5)).filter((w) => !NEUTRAL_WORDS.has(w)),
  );

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

    const draft = parse(summaryModelSchema, raw);
    if (!draft) continue;

    // Billedreferencer skal præcis matche de billeder der blev sendt.
    const refs = draft.images.map((img) => img.imageRef);
    const refsOk =
      refs.length === input.images.length &&
      new Set(refs).size === refs.length &&
      refs.every((ref) => refToId.has(ref));
    if (!refsOk) continue;

    const textFields = [draft.summaryText, ...draft.patientWishes, ...draft.patientReportedHistory].join(" ");
    if (findForbiddenCategories(textFields, allowTerms).length > 0) continue;

    const imageProblem = draft.images.some((img) => {
      const text = [img.visibleArea, ...img.observations].join(" ");
      if (findForbiddenCategories(text).length > 0) return true;
      return wordsOf(text, 5).some((w) => forbiddenInImages.has(w));
    });
    if (imageProblem) continue;

    const images: AiImageObservation[] = draft.images.map((img) => ({
      imageRef: refToId.get(img.imageRef) as string,
      view: img.view,
      visibleArea: img.visibleArea,
      observations: img.observations,
      quality: img.quality,
    }));

    const outOfScopeTopics = mergeTopics(draft.outOfScopeTopics, detected);
    const retakeImages = images
      .filter((img) => img.quality !== "ok")
      .map((img) => ({ imageId: img.imageRef, reason: img.quality as Exclude<ImageQuality, "ok"> }));

    if (retakeImages.length > 0) {
      return { summary: null, retakeImages, outOfScopeTopics, fallback: "none" };
    }

    return {
      summary: {
        summaryText: draft.summaryText,
        patientWishes: draft.patientWishes,
        patientReportedHistory: draft.patientReportedHistory,
        images,
        outOfScopeTopics,
      },
      retakeImages: [],
      outOfScopeTopics,
      fallback: "none",
    };
  }

  return { summary: null, retakeImages: [], outOfScopeTopics: detected, fallback: "write_yourself" };
}
