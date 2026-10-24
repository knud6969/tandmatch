// Output-skemaer for modellen (architecture 7.4). Dobbelt: JSON Schema sendes til OpenAI (strict),
// og zod validerer svaret på serveren. Ingen prisfelter og ingen klinikfelter.
// Ren fil uden server-imports, så den kan testes direkte.
// MDR-TILPASNING: preliminaryAssessment forbliver i skemaet (strict kræver faste felter), men
// guard.ts tvinger det til null, når rules.allowPreliminaryAssessment er false.

import { z } from "zod";
import { OUT_OF_SCOPE_TOPICS, IMAGE_QUALITIES, IMAGE_VIEWS } from "@/lib/cases/constants/ai";
import { aiImageObservationBase, aiSlugListSchema, aiSummaryBase, aiTopicsSchema, SLUG_PATTERN } from "@/lib/cases/constants/ai-schemas";
import { MAX_CONFIRMED_SERVICES_PER_CASE } from "@/lib/common/constants/limits";

export { SLUG_PATTERN };
export const MAX_SUGGESTED_SERVICES = MAX_CONFIRMED_SERVICES_PER_CASE;

const slugList = aiSlugListSchema;
const topics = aiTopicsSchema;

export const chatTurnSchema = z.strictObject({
  reply: z.string().min(1).max(700),
  preliminaryAssessment: z.string().min(1).max(400).nullable(),
  suggestedServices: slugList,
  emergency: z.boolean(),
  outOfScopeTopics: topics,
  readyForSummary: z.boolean(),
  quickReplies: z.array(z.string().min(1).max(60)).max(4),
  // Kun i billedture (7.9c): teknisk kvalitet og vinkel pr. nyt billede. Tom ved almindelige ture.
  images: z
    .array(
      z.strictObject({
        imageRef: z.string().min(1).max(10),
        view: z.enum(IMAGE_VIEWS),
        quality: z.enum(IMAGE_QUALITIES),
      }),
    )
    .max(5)
    .default([]),
});

// Modellens opsummering: samme form som den færdige, men billederne har en kort intern reference ("img_1").
export const summaryModelSchema = aiSummaryBase.extend({
  images: z.array(aiImageObservationBase.extend({ imageRef: z.string().min(1).max(10) })).max(5),
});

const topicsJson = { type: "array", items: { type: "string", enum: [...OUT_OF_SCOPE_TOPICS] } };
const stringArray = { type: "array", items: { type: "string" } };

// JSON Schema til OpenAI structured output (strict): alle felter required, additionalProperties false.
// Længder håndhæves af zod (strict mode understøtter ikke maxLength i alle modeller).
export const CHAT_TURN_JSON_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string" },
    preliminaryAssessment: { type: ["string", "null"] },
    suggestedServices: stringArray,
    emergency: { type: "boolean" },
    outOfScopeTopics: topicsJson,
    readyForSummary: { type: "boolean" },
    quickReplies: stringArray,
    images: {
      type: "array",
      items: {
        type: "object",
        properties: {
          imageRef: { type: "string" },
          view: { type: "string", enum: [...IMAGE_VIEWS] },
          quality: { type: "string", enum: [...IMAGE_QUALITIES] },
        },
        required: ["imageRef", "view", "quality"],
        additionalProperties: false,
      },
    },
  },
  required: ["reply", "preliminaryAssessment", "suggestedServices", "emergency", "outOfScopeTopics", "readyForSummary", "quickReplies", "images"],
  additionalProperties: false,
} as const;

export const SUMMARY_JSON_SCHEMA = {
  type: "object",
  properties: {
    summaryText: { type: "string" },
    patientWishes: stringArray,
    patientReportedHistory: stringArray,
    suggestedServices: stringArray,
    images: {
      type: "array",
      items: {
        type: "object",
        properties: {
          imageRef: { type: "string" },
          view: { type: "string", enum: [...IMAGE_VIEWS] },
          visibleArea: { type: "string" },
          observations: stringArray,
          quality: { type: "string", enum: [...IMAGE_QUALITIES] },
        },
        required: ["imageRef", "view", "visibleArea", "observations", "quality"],
        additionalProperties: false,
      },
    },
    outOfScopeTopics: topicsJson,
  },
  required: [
    "summaryText",
    "patientWishes",
    "patientReportedHistory",
    "suggestedServices",
    "images",
    "outOfScopeTopics",
  ],
  additionalProperties: false,
} as const;

// Navne på skemaerne, som sendes til modellen (OpenAI strict json_schema).
export const CHAT_SCHEMA_NAME = "tandmatch_chat_turn";
export const SUMMARY_SCHEMA_NAME = "tandmatch_summary";
