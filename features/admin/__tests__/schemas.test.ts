import { describe, expect, it } from "vitest";
import {
  adminClinicStatusSchema,
  adminClinicsQuerySchema,
  adminModerateSchema,
  adminModerationKindSchema,
  adminModerationQuerySchema,
} from "@/lib/admin/schemas/admin";
import { MODERATION_REJECTION_REASONS } from "@/lib/admin/constants/admin";

describe("admin-skemaer", () => {
  it("moderationsforespørgslen har standardværdierne review og pending", () => {
    expect(adminModerationQuerySchema.parse({})).toEqual({ kind: "review", status: "pending" });
    expect(adminModerationQuerySchema.safeParse({ kind: "clinic" }).success).toBe(false);
  });

  it("kun approved og rejected kan sættes, og ukendte felter afvises", () => {
    expect(adminModerateSchema.safeParse({ status: "approved" }).success).toBe(true);
    expect(adminModerateSchema.safeParse({ status: "pending" }).success).toBe(false);
    expect(adminModerateSchema.safeParse({ status: "rejected", reason: "x".repeat(501) }).success).toBe(false);
    expect(adminModerateSchema.safeParse({ status: "approved", patientId: "x" }).success).toBe(false);
    expect(adminModerateSchema.parse({ status: "rejected", reason: "  Irrelevant  " }).reason).toBe("Irrelevant");
  });

  it("klinikstatus kan kun sættes til verified eller registered", () => {
    expect(adminClinicStatusSchema.safeParse({ status: "verified" }).success).toBe(true);
    expect(adminClinicStatusSchema.safeParse({ status: "registered", reason: "Pause" }).success).toBe(true);
    expect(adminClinicStatusSchema.safeParse({ status: "imported" }).success).toBe(false);
    expect(adminClinicStatusSchema.safeParse({ status: "removed" }).success).toBe(false);
  });

  it("klinikfilteret accepterer en status og en kort søgning", () => {
    expect(adminClinicsQuerySchema.safeParse({ status: "verified", q: "  tand " }).data).toEqual({ status: "verified", q: "tand" });
    expect(adminClinicsQuerySchema.safeParse({ q: "x".repeat(101) }).success).toBe(false);
  });

  it("stien accepterer kun review og reply, og der er fire hurtigvalg til afvisning", () => {
    expect(adminModerationKindSchema.safeParse("reply").success).toBe(true);
    expect(adminModerationKindSchema.safeParse("clinic").success).toBe(false);
    expect(MODERATION_REJECTION_REASONS).toHaveLength(4);
  });
});
