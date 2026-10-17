import { describe, expect, it } from "vitest";
import { IMAGE_DESCRIPTION_MAX_CHARS } from "@/lib/constants/limits";
import { buildsOnAiDraft, imageDescription } from "@/lib/domain/summary";
import type { AiSummary } from "@/lib/types/ai";

const draft: AiSummary = {
  summaryText: "Patienten ønsker blegning af gule tænder i overmunden",
  patientWishes: [],
  patientReportedHistory: [],
  suggestedServices: [],
  images: [],
  outOfScopeTopics: [],
};

describe("imageDescription", () => {
  it("samler område og observationer", () => {
    expect(imageDescription("Overmund", ["Misfarvning", "Mellemrum"])).toBe("Overmund. Misfarvning. Mellemrum");
  });
  it("afkortes til databasens grænse (500 tegn)", () => {
    const text = imageDescription("a".repeat(80), Array.from({ length: 4 }, () => "b".repeat(120)));
    expect(text.length).toBeLessThanOrEqual(IMAGE_DESCRIPTION_MAX_CHARS);
    const long = imageDescription("a".repeat(400), ["b".repeat(400)]);
    expect(Array.from(long).length).toBe(IMAGE_DESCRIPTION_MAX_CHARS);
  });
  it("tæller tegn, ikke UTF-16-enheder", () => {
    const emoji = imageDescription("😀".repeat(300), []);
    expect(Array.from(emoji).length).toBe(300);
  });
});

describe("buildsOnAiDraft", () => {
  it("false uden udkast", () => expect(buildsOnAiDraft("Blegning af tænder", null)).toBe(false));
  it("true når teksten bygger på udkastet", () =>
    expect(buildsOnAiDraft("Patienten ønsker blegning af gule tænder", draft)).toBe(true));
  it("false når teksten er skrevet selv", () =>
    expect(buildsOnAiDraft("Jeg har ondt og vil gerne høre om priser", draft)).toBe(false));
});
