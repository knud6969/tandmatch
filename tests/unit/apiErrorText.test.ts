import { describe, expect, it } from "vitest";
import { API_ERROR_TEXTS, GENERIC_ERROR_TEXT, NEUTRAL_ERROR_TEXTS } from "@/lib/constants/error-texts";
import { apiErrorText } from "@/lib/domain/errors";
import { roundPosition } from "@/lib/domain/position";

describe("apiErrorText", () => {
  it("giver den faste tekst for kendte koder, uanset serverens besked", () => {
    for (const code of ["INVALID_CREDENTIALS", "SLOT_TAKEN", "LEAD_LIMIT", "RATE_LIMITED", "TERMS_REQUIRED"]) {
      expect(apiErrorText(code, "Something else")).toBe(API_ERROR_TEXTS[code]);
    }
  });

  it("bruger serverens danske besked for ukendte koder", () => {
    expect(apiErrorText("NY_KODE", "Noget gik galt hos os.")).toBe("Noget gik galt hos os.");
  });

  it("erstatter engelsk servertekst med den neutrale tekst for koden", () => {
    expect(apiErrorText("VALIDATION_ERROR", "Invalid input: expected string")).toBe(NEUTRAL_ERROR_TEXTS.VALIDATION_ERROR);
  });

  it("falder tilbage til den generiske tekst", () => {
    expect(apiErrorText("NY_KODE", "Invalid input")).toBe(GENERIC_ERROR_TEXT);
    expect(apiErrorText("NY_KODE", "   ")).toBe(GENERIC_ERROR_TEXT);
    expect(apiErrorText("NY_KODE", "x".repeat(301))).toBe(GENERIC_ERROR_TEXT);
  });
});

describe("roundPosition", () => {
  it("runder til to decimaler", () => {
    expect(roundPosition(55.67594)).toBe(55.68);
    expect(roundPosition(12.56553)).toBe(12.57);
  });
});
