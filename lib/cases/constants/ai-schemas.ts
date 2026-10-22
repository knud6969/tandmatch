// Fælles zod-skemaer for AI-opsummeringen (architecture 7.4, 10.6). Eneste definition af opsummeringens form:
// typerne AiSummary og AiImageObservation i lib/types/ai.ts udledes herfra, services/ai/schemas.ts bygger modelskemaet
// på de samme baser (med billedreference "img_n"), og lib/schemas/aiSummary.ts kan genbruge `aiSummarySchema`
// (billedreference = case_images.id). Ren fil uden server-imports.

import { z } from "zod";
import { IMAGE_QUALITIES, IMAGE_VIEWS, OUT_OF_SCOPE_TOPICS } from "@/lib/cases/constants/ai";
import { MAX_CONFIRMED_SERVICES_PER_CASE } from "@/lib/common/constants/limits";

export const SLUG_PATTERN = /^[a-z0-9_]{2,60}$/;

export const aiSlugListSchema = z.array(z.string().regex(SLUG_PATTERN)).max(MAX_CONFIRMED_SERVICES_PER_CASE);
export const aiTopicsSchema = z.array(z.enum(OUT_OF_SCOPE_TOPICS)).max(OUT_OF_SCOPE_TOPICS.length);

// Billedbeskrivelse uden reference (referencen er "img_n" hos modellen og case_images.id andre steder).
export const aiImageObservationBase = z.strictObject({
  view: z.enum(IMAGE_VIEWS),
  visibleArea: z.string().min(1).max(80),
  observations: z.array(z.string().min(1).max(120)).max(4),
  quality: z.enum(IMAGE_QUALITIES),
});

// Opsummeringen uden billeder.
export const aiSummaryBase = z.strictObject({
  summaryText: z.string().min(1).max(800),
  patientWishes: z.array(z.string().min(1).max(200)).max(5),
  patientReportedHistory: z.array(z.string().min(1).max(200)).max(5),
  suggestedServices: aiSlugListSchema,
  outOfScopeTopics: aiTopicsSchema,
});

export const aiImageObservationSchema = aiImageObservationBase.extend({ imageRef: z.string().min(1).max(64) });

// Den færdige opsummering (billedreference = case_images.id). Genbruges af lib/schemas/aiSummary.ts.
export const aiSummarySchema = aiSummaryBase.extend({ images: z.array(aiImageObservationSchema).max(5) });
