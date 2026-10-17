import { describe, expect, it } from "vitest";
import { canSendCase, canSendMoreLeads, isActiveLead } from "@/lib/domain/leads";

const ready = { status: "draft", summaryApprovedAt: "2026-10-17T10:00:00Z", postalCode: "2100", preferredTimeframe: "asap" } as const;

describe("leads-domæne", () => {
  it("tæller sent, accepted og booked som aktive", () => {
    expect(isActiveLead("sent")).toBe(true);
    expect(isActiveLead("booked")).toBe(true);
    expect(isActiveLead("declined")).toBe(false);
    expect(isActiveLead("withdrawn")).toBe(false);
  });

  it("har plads under 3 aktive og 10 i alt", () => {
    expect(canSendMoreLeads(2, 9)).toBe(true);
    expect(canSendMoreLeads(3, 3)).toBe(false);
    expect(canSendMoreLeads(0, 10)).toBe(false);
  });

  it("en sendt sag kan sendes til flere klinikker, en lukket kan ikke", () => {
    expect(canSendCase(ready, 1, 0)).toBe(true);
    expect(canSendCase({ ...ready, status: "submitted" }, 1, 2)).toBe(true);
    expect(canSendCase({ ...ready, status: "submitted" }, 1, 3)).toBe(false);
    expect(canSendCase({ ...ready, status: "closed" }, 1, 0)).toBe(false);
    expect(canSendCase({ ...ready, summaryApprovedAt: null }, 1, 0)).toBe(false);
    expect(canSendCase(ready, 0, 0)).toBe(false);
  });
});
