import { describe, expect, it } from "vitest";
import { priceEstimate } from "@/lib/booking/domain/reviews";
import { toClinicDate, toClinicMonth } from "@/lib/common/domain/time";
import { createReviewSchema, replyReviewSchema } from "@/lib/booking/schemas/reviews";

const bookingId = "6f1c3a52-0c0e-4a64-9d3f-2f4f6c1d9b11";
const valid = { bookingId, stars: 4, text: "Rolig og grundig behandling hos klinikken.", priceAccuracy: "as_quoted" } as const;

describe("reviews-domæne: prisoverslag", () => {
  it("den præciserede pris går forud for listeprisen", () => {
    expect(priceEstimate({ min: 1100, max: 1300 }, { min: 800, max: 1000 })).toEqual({ min: 1100, max: 1300 });
  });
  it("listeprisen bruges, når der ikke er en præciseret pris", () => {
    expect(priceEstimate(null, { min: 800, max: 1000 })).toEqual({ min: 800, max: 1000 });
  });
  it("uden begge er der intet prisoverslag", () => {
    expect(priceEstimate(null, null)).toBeNull();
  });
});

describe("tid: dansk dato og måned", () => {
  it("dato og måned beregnes i dansk tid, også omkring midnat", () => {
    expect(toClinicDate("2026-10-20T10:00:00Z")).toBe("2026-10-20");
    expect(toClinicDate("2026-10-20T22:30:00Z")).toBe("2026-10-21"); // CEST: 00:30 næste dag
    expect(toClinicMonth("2026-10-31T23:30:00Z")).toBe("2026-11"); // CET: 00:30 1. november
    expect(toClinicDate("2026-12-31T23:30:00Z")).toBe("2027-01-01");
  });
});

describe("reviews-skema: anmeldelse", () => {
  it("accepterer en gyldig anmeldelse og trimmer teksten", () => {
    const parsed = createReviewSchema.parse({ ...valid, text: `  ${valid.text}  `, transparencyComment: "   " });
    expect(parsed.text).toBe(valid.text);
    expect(parsed.transparencyComment).toBeUndefined();
  });

  it("grænserne for stjerner, tekst, faktisk pris og kommentar", () => {
    const ok = (extra: object) => createReviewSchema.safeParse({ ...valid, ...extra }).success;
    expect(ok({ stars: 1 })).toBe(true);
    expect(ok({ stars: 5 })).toBe(true);
    expect(ok({ stars: 0 })).toBe(false);
    expect(ok({ stars: 6 })).toBe(false);
    expect(ok({ stars: 2.5 })).toBe(false);
    expect(ok({ text: "x".repeat(20) })).toBe(true);
    expect(ok({ text: "x".repeat(19) })).toBe(false);
    expect(ok({ text: "x".repeat(2000) })).toBe(true);
    expect(ok({ text: "x".repeat(2001) })).toBe(false);
    expect(ok({ actualPrice: 0 })).toBe(true);
    expect(ok({ actualPrice: -1 })).toBe(false);
    expect(ok({ actualPrice: 99.5 })).toBe(false);
    expect(ok({ actualPrice: 1_000_001 })).toBe(false);
    expect(ok({ transparencyComment: "x".repeat(500) })).toBe(true);
    expect(ok({ transparencyComment: "x".repeat(501) })).toBe(false);
    expect(ok({ lackedTransparency: false })).toBe(true);
  });

  it("præcis tre svar på prisnøjagtighed, ingen 'lavere'", () => {
    const ok = (priceAccuracy: string) => createReviewSchema.safeParse({ ...valid, priceAccuracy }).success;
    expect(ok("as_quoted")).toBe(true);
    expect(ok("slightly_higher")).toBe(true);
    expect(ok("much_higher")).toBe(true);
    expect(ok("lower")).toBe(false);
  });

  it("afviser ukendte felter som clinicId og manglende booking", () => {
    expect(createReviewSchema.safeParse({ ...valid, clinicId: bookingId }).success).toBe(false);
    expect(createReviewSchema.safeParse({ ...valid, bookingId: "ikke-et-id" }).success).toBe(false);
    expect(createReviewSchema.safeParse({ ...valid, moderationStatus: "approved" }).success).toBe(false);
  });
});

describe("reviews-skema: svar", () => {
  it("1 til 1000 tegn efter trim", () => {
    expect(replyReviewSchema.safeParse({ text: "Tak." }).success).toBe(true);
    expect(replyReviewSchema.safeParse({ text: "   " }).success).toBe(false);
    expect(replyReviewSchema.safeParse({ text: "x".repeat(1000) }).success).toBe(true);
    expect(replyReviewSchema.safeParse({ text: "x".repeat(1001) }).success).toBe(false);
    expect(replyReviewSchema.safeParse({ text: "Tak.", clinicId: bookingId }).success).toBe(false);
  });
});
