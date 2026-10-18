import { describe, expect, it } from "vitest";
import { canCancel, canMarkNoShow, canReview, graceEndsAt } from "@/lib/domain/bookings";
import { toClinicDate, toClinicMonth } from "@/lib/domain/time";
import { formatDay, formatTime } from "@/views/utils/format";

// Tidszoner for booking (6.6): tider omkring midnat og sommertid vises og grupperes i dansk tid (Europe/Copenhagen),
// uanset serverens tidszone. Testkørslen sætter ikke TZ, så vi tester mod faste UTC-tidspunkter.

describe("dansk tid omkring midnat", () => {
  it("23.45 UTC om sommeren er næste dag 01.45 dansk tid", () => {
    expect(toClinicDate("2026-07-14T23:45:00Z")).toBe("2026-07-15");
    expect(formatTime("2026-07-14T23:45:00Z")).toBe("01.45");
    expect(toClinicDate("2026-07-14T23:45:00Z")).toBe("2026-07-15");
  });
  it("22.00 UTC om sommeren er præcis midnat dansk tid og hører til den nye dag", () => {
    expect(toClinicDate("2026-07-14T22:00:00Z")).toBe("2026-07-15");
    expect(formatTime("2026-07-14T22:00:00Z")).toBe("00.00");
    expect(toClinicDate("2026-07-14T21:59:00Z")).toBe("2026-07-14");
  });
  it("om vinteren er forskydningen én time", () => {
    expect(toClinicDate("2026-12-14T22:59:00Z")).toBe("2026-12-14");
    expect(toClinicDate("2026-12-14T23:00:00Z")).toBe("2026-12-15");
    expect(formatTime("2026-12-14T23:00:00Z")).toBe("00.00");
  });
  it("årsskifte og månedsskifte følger dansk tid", () => {
    expect(toClinicDate("2026-12-31T23:30:00Z")).toBe("2027-01-01");
    expect(toClinicMonth("2026-12-31T23:30:00Z")).toBe("2027-01");
    expect(formatDay("2026-12-31T23:30:00Z")).toContain("fredag 1. januar");
  });
});

describe("sommertid", () => {
  it("skiftet til sommertid 29. marts 2026: 01.59 findes, 02.xx findes ikke, 03.00 følger", () => {
    expect(formatTime("2026-03-29T00:59:00Z")).toBe("01.59");
    expect(formatTime("2026-03-29T01:00:00Z")).toBe("03.00");
    expect(toClinicDate("2026-03-28T22:59:00Z")).toBe("2026-03-28");
    expect(toClinicDate("2026-03-28T23:00:00Z")).toBe("2026-03-29");
  });
  it("skiftet til vintertid 25. oktober 2026: 02.30 findes to gange", () => {
    expect(formatTime("2026-10-25T00:30:00Z")).toBe("02.30"); // sommertid
    expect(formatTime("2026-10-25T01:30:00Z")).toBe("02.30"); // vintertid
    expect(formatTime("2026-10-25T02:00:00Z")).toBe("03.00");
    expect(toClinicDate("2026-10-24T22:00:00Z")).toBe("2026-10-25");
    expect(toClinicDate("2026-10-25T22:59:00Z")).toBe("2026-10-25");
    expect(toClinicDate("2026-10-25T23:00:00Z")).toBe("2026-10-26");
  });
  it("en dag med 25 timer: dagene 25. og 26. oktober holder samme grupper", () => {
    const keys = new Set(["2026-10-24T22:00:00Z", "2026-10-25T10:00:00Z", "2026-10-25T22:30:00Z"].map(toClinicDate));
    expect([...keys]).toEqual(["2026-10-25"]);
  });
});

describe("fristen på 24 timer går på rigtigt forløbet tid over sommertidsskiftet", () => {
  it("sluttid lørdag aften før vintertid: fristen er 24 timer senere i UTC, ikke samme klokkeslæt", () => {
    // Slutter 24. okt. 23.00 lokal (21.00Z, sommertid). 24 timer senere er søndag 22.00 lokal (21.00Z + 24 t = 25. okt. 21.00Z).
    expect(graceEndsAt("2026-10-24T21:00:00Z").toISOString()).toBe("2026-10-25T21:00:00.000Z");
    expect(formatTime("2026-10-25T21:00:00Z")).toBe("22.00");
  });
  it("anmeldelse åbner præcis ved fristen og ikke før", () => {
    const ends = "2026-10-24T21:00:00Z";
    const before = new Date("2026-10-25T20:59:59Z");
    const at = new Date("2026-10-25T21:00:00Z");
    expect(canReview("completed", ends, false, before)).toBe(false);
    expect(canReview("completed", ends, false, at)).toBe(true);
    expect(canReview("completed", ends, true, at)).toBe(false);
    expect(canReview("no_show", ends, false, at)).toBe(false);
    expect(canReview("cancelled", ends, false, at)).toBe(false);
    expect(canReview("booked", ends, false, at)).toBe(false);
  });
});

describe("aflysning og udeblivelse lige omkring starttid", () => {
  const starts = "2026-07-14T08:00:00Z";
  const ends = "2026-07-14T08:30:00Z";
  it("kan aflyses til sidste millisekund før start, ikke på starttidspunktet", () => {
    expect(canCancel("booked", starts, new Date("2026-07-14T07:59:59.999Z"))).toBe(true);
    expect(canCancel("booked", starts, new Date("2026-07-14T08:00:00.000Z"))).toBe(false);
    expect(canCancel("held", starts, new Date("2026-07-14T07:00:00Z"))).toBe(false);
  });
  it("udeblivelse åbner ved start og lukker 24 timer efter sluttid", () => {
    expect(canMarkNoShow("booked", starts, ends, new Date("2026-07-14T07:59:59Z"))).toBe(false);
    expect(canMarkNoShow("booked", starts, ends, new Date("2026-07-14T08:00:00Z"))).toBe(true);
    expect(canMarkNoShow("booked", starts, ends, new Date("2026-07-15T08:29:59Z"))).toBe(true);
    expect(canMarkNoShow("booked", starts, ends, new Date("2026-07-15T08:30:00Z"))).toBe(false);
    expect(canMarkNoShow("held", starts, ends, new Date("2026-07-14T09:00:00Z"))).toBe(false);
  });
});
