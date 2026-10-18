import { describe, expect, it } from "vitest";
import { clinicLeadsQuerySchema, leadDecisionSchema } from "@/lib/schemas/leads";
import { sendMessageSchema } from "@/lib/schemas/messages";

describe("leadDecisionSchema", () => {
  it("tillader accept uden og med kommentar og pris", () => {
    expect(leadDecisionSchema.safeParse({ decision: "accept" }).success).toBe(true);
    expect(leadDecisionSchema.safeParse({ decision: "accept", comment: "Ok", quotedPriceMin: 100, quotedPriceMax: 100 }).success).toBe(true);
  });

  it("kræver min og max sammen, og min højst max", () => {
    expect(leadDecisionSchema.safeParse({ decision: "accept", quotedPriceMin: 100 }).success).toBe(false);
    expect(leadDecisionSchema.safeParse({ decision: "accept", quotedPriceMin: 200, quotedPriceMax: 100 }).success).toBe(false);
    expect(leadDecisionSchema.safeParse({ decision: "accept", quotedPriceMin: 1.5, quotedPriceMax: 100 }).success).toBe(false);
  });

  it("afviser clinic_left og mangler på årsag", () => {
    expect(leadDecisionSchema.safeParse({ decision: "decline", reason: "other" }).success).toBe(true);
    expect(leadDecisionSchema.safeParse({ decision: "decline", reason: "clinic_left" }).success).toBe(false);
    expect(leadDecisionSchema.safeParse({ decision: "decline" }).success).toBe(false);
  });

  it("begrænser kommentar og note", () => {
    expect(leadDecisionSchema.safeParse({ decision: "accept", comment: "x".repeat(501) }).success).toBe(false);
    expect(leadDecisionSchema.safeParse({ decision: "decline", reason: "other", note: "x".repeat(201) }).success).toBe(false);
  });
});

describe("clinicLeadsQuerySchema", () => {
  it("tillader kun kendte statusser", () => {
    expect(clinicLeadsQuerySchema.safeParse({}).success).toBe(true);
    expect(clinicLeadsQuerySchema.safeParse({ status: "sent" }).success).toBe(true);
    expect(clinicLeadsQuerySchema.safeParse({ status: "andet" }).success).toBe(false);
  });
});

describe("sendMessageSchema", () => {
  it("trimmer og begrænser længden til 1-2000", () => {
    expect(sendMessageSchema.parse({ body: "  hej  " }).body).toBe("hej");
    expect(sendMessageSchema.safeParse({ body: "   " }).success).toBe(false);
    expect(sendMessageSchema.safeParse({ body: "x".repeat(2001) }).success).toBe(false);
    expect(sendMessageSchema.safeParse({ body: "hej", senderRole: "clinic" }).success).toBe(false);
  });
});
