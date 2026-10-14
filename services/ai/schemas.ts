// Output-skemaer for modellen (architecture 7.4). Dobbelt: JSON Schema sendes til OpenAI (strict),
// og zod validerer svaret på serveren. Ingen prisfelter og ingen klinikfelter.
// Ren fil uden server-imports, så den kan testes direkte.
// MDR-TILPASNING: preliminaryAssessment forbliver i skemaet (strict kræver faste felter), men
// guard.ts tvinger det til null, når rules.allowPreliminaryAssessment er false.

import { z } from "zod";

export const OUT_OF_SCOPE_TOPICS = ["price", "clinic_recommendation"] as const;
export const IMAGE_VIEWS = ["front", "upper", "lower", "side_left", "side_right", "unclear"] as const;
export const IMAGE_QUALITIES = ["ok", "too_dark", "blurry", "wrong_angle", "not_teeth"] as const;

export const MAX_SUGGESTED_SERVICES = 5;
export const SLUG_PATTERN = /^[a-z0-9_]{2,60}$/;

const slugList = z.array(z.string().regex(SLUG_PATTERN)).max(MAX_SUGGESTED_SERVICES);
const topics = z.array(z.enum(OUT_OF_SCOPE_TOPICS)).max(OUT_OF_SCOPE_TOPICS.length);

export const chatTurnSchema = z.strictObject({
  reply: z.string().min(1).max(700),
  preliminaryAssessment: z.string().min(1).max(400).nullable(),
  suggestedServices: slugList,
  emergency: z.boolean(),
  outOfScopeTopics: topics,
  readyForSummary: z.boolean(),
});

export const summaryModelSchema = z.strictObject({
  summaryText: z.string().min(1).max(800),
  patientWishes: z.array(z.string().min(1).max(200)).max(5),
  patientReportedHistory: z.array(z.string().min(1).max(200)).max(5),
  suggestedServices: slugList,
  images: z
    .array(
      z.strictObject({
        imageRef: z.string().min(1).max(10),
        view: z.enum(IMAGE_VIEWS),
        visibleArea: z.string().min(1).max(80),
        observations: z.array(z.string().min(1).max(120)).max(4),
        quality: z.enum(IMAGE_QUALITIES),
      }),
    )
    .max(5),
  outOfScopeTopics: topics,
});

export type ModelChatTurn = z.infer<typeof chatTurnSchema>;
export type ModelSummary = z.infer<typeof summaryModelSchema>;

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
  },
  required: ["reply", "preliminaryAssessment", "suggestedServices", "emergency", "outOfScopeTopics", "readyForSummary"],
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
