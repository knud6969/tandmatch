import { describe, expect, it } from "vitest";
import { canCancel, canMarkNoShow, canReview, graceEndsAt, pickLeadBooking } from "@/lib/domain/bookings";

const HOUR = 3_600_000;
const now = new Date("2026-10-20T12:00:00Z");
const at = (hours: number) => new Date(now.getTime() + hours * HOUR).toISOString();

describe("bookings-domæne: aflysning", () => {
  it("kan kun aflyse en booket tid før starttid", () => {
    expect(canCancel("booked", at(1), now)).toBe(true);
    expect(canCancel("booked", at(0), now)).toBe(false); // starter nu
    expect(canCancel("booked", at(-1), now)).toBe(false);
  });

  it("kan ikke aflyse reserverede, gennemførte, udeblevne eller aflyste tider", () => {
    for (const status of ["held", "completed", "no_show", "cancelled"] as const) {
      expect(canCancel(status, at(5), now)).toBe(false);
    }
  });
});

describe("bookings-domæne: udeblivelse", () => {
  it("vinduet er fra starttid til 24 timer efter sluttid", () => {
    expect(canMarkNoShow("booked", at(1), at(2), now)).toBe(false); // før starttid
    expect(canMarkNoShow("booked", at(0), at(1), now)).toBe(true); // lige startet
    expect(canMarkNoShow("booked", at(-2), at(-1), now)).toBe(true); // slut for 1 time siden
    expect(canMarkNoShow("booked", at(-24), at(-23.5), now)).toBe(true); // 23,5 time efter sluttid
    expect(canMarkNoShow("booked", at(-26), at(-24), now)).toBe(false); // præcis 24 timer efter sluttid: lukket
    expect(canMarkNoShow("booked", at(-48), at(-47), now)).toBe(false);
  });

  it("kun for booked", () => {
    for (const status of ["held", "completed", "no_show", "cancelled"] as const) {
      expect(canMarkNoShow(status, at(-1), at(1), now)).toBe(false);
    }
  });

  it("fristen er sluttid + 24 timer", () => {
    expect(graceEndsAt(at(1)).toISOString()).toBe(at(25));
  });
});

describe("bookings-domæne: anmeldelse", () => {
  it("først efter sluttid + 24 timer og kun for completed", () => {
    expect(canReview("completed", at(-24), false, now)).toBe(true); // fristen udløb nu
    expect(canReview("completed", at(-30), false, now)).toBe(true);
    expect(canReview("completed", at(-23), false, now)).toBe(false); // før fristen
    expect(canReview("booked", at(-30), false, now)).toBe(false);
    expect(canReview("no_show", at(-30), false, now)).toBe(false);
    expect(canReview("cancelled", at(-30), false, now)).toBe(false);
    expect(canReview("held", at(-30), false, now)).toBe(false);
  });

  it("kun én anmeldelse pr. booking", () => {
    expect(canReview("completed", at(-30), true, now)).toBe(false);
  });
});

describe("bookings-domæne: leadets booking", () => {
  const b = (id: string, status: "held" | "booked" | "cancelled" | "completed", createdAt: string) => ({ id, status, createdAt });

  it("vælger en aktiv booking frem for en nyere inaktiv", () => {
    const picked = pickLeadBooking([b("a", "booked", "2026-10-01T10:00:00Z"), b("b", "cancelled", "2026-10-02T10:00:00Z")]);
    expect(picked?.id).toBe("a");
  });

  it("vælger ellers den nyeste", () => {
    const picked = pickLeadBooking([b("a", "cancelled", "2026-10-01T10:00:00Z"), b("b", "cancelled", "2026-10-03T10:00:00Z"), b("c", "completed", "2026-10-02T10:00:00Z")]);
    expect(picked?.id).toBe("b");
  });

  it("giver null uden bookinger", () => {
    expect(pickLeadBooking([])).toBeNull();
  });
});
