// Output-skemaer for modellen (architecture 7.4). Dobbelt: JSON Schema sendes til OpenAI (strict),
// og zod validerer svaret på serveren. Ren modul uden server-imports, så den kan testes direkte.

import { z } from "zod";

export const OUT_OF_SCOPE_TOPICS = ["diagnosis", "severity", "treatment", "price"] as const;
export const IMAGE_VIEWS = ["front", "upper", "lower", "side_left", "side_right", "unclear"] as const;
export const IMAGE_QUALITIES = ["ok", "too_dark", "blurry", "wrong_angle", "not_teeth"] as const;

export const chatTurnSchema = z
  .object({
    reply: z.string().min(1).max(700),
    outOfScopeTopics: z.array(z.enum(OUT_OF_SCOPE_TOPICS)).max(4),
    readyForSummary: z.boolean(),
  })
  .strict();

export const summaryModelSchema = z
  .object({
    summaryText: z.string().min(1).max(800),
    patientWishes: z.array(z.string().min(1).max(200)).max(5),
    patientReportedHistory: z.array(z.string().min(1).max(200)).max(5),
    images: z
      .array(
        z
          .object({
            imageRef: z.string().min(1).max(10),
            view: z.enum(IMAGE_VIEWS),
            visibleArea: z.string().min(1).max(80),
            observations: z.array(z.string().min(1).max(120)).max(4),
            quality: z.enum(IMAGE_QUALITIES),
          })
          .strict(),
      )
      .max(5),
    outOfScopeTopics: z.array(z.enum(OUT_OF_SCOPE_TOPICS)).max(4),
  })
  .strict();

export type ModelChatTurn = z.infer<typeof chatTurnSchema>;
export type ModelSummary = z.infer<typeof summaryModelSchema>;

const topicsJson = { type: "array", items: { type: "string", enum: [...OUT_OF_SCOPE_TOPICS] } };

// JSON Schema til OpenAI structured output (strict). Alle felter er required, additionalProperties er false.
export const CHAT_TURN_JSON_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string" },
    outOfScopeTopics: topicsJson,
    readyForSummary: { type: "boolean" },
  },
  required: ["reply", "outOfScopeTopics", "readyForSummary"],
  additionalProperties: false,
} as const;

export const SUMMARY_JSON_SCHEMA = {
  type: "object",
  properties: {
    summaryText: { type: "string" },
    patientWishes: { type: "array", items: { type: "string" } },
    patientReportedHistory: { type: "array", items: { type: "string" } },
    images: {
      type: "array",
      items: {
        type: "object",
        properties: {
          imageRef: { type: "string" },
          view: { type: "string", enum: [...IMAGE_VIEWS] },
          visibleArea: { type: "string" },
          observations: { type: "array", items: { type: "string" } },
          quality: { type: "string", enum: [...IMAGE_QUALITIES] },
        },
        required: ["imageRef", "view", "visibleArea", "observations", "quality"],
        additionalProperties: false,
      },
    },
    outOfScopeTopics: topicsJson,
  },
  required: ["summaryText", "patientWishes", "patientReportedHistory", "images", "outOfScopeTopics"],
  additionalProperties: false,
} as const;
