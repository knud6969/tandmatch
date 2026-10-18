import { describe, expect, it } from "vitest";
import { BOOKING_HORIZON_DAYS, FIRST_AVAILABLE_SEARCH_DAYS } from "@/lib/constants/bookings";
import { AvailabilityService, type OpeningWindow } from "@/services/availabilityService";

// Onsdag 14. oktober 2026, 10:00 lokal tid (sommertid, UTC+2).
const NOW = new Date("2026-10-14T08:00:00Z");

const at = (iso: string) => new Date(iso);
const service = (now: Date = NOW) => new AvailabilityService(() => now);

const weekdays = (opensAt: string, closesAt: string, isEmergency = false): OpeningWindow[] =>
  [1, 2, 3, 4, 5].map((weekday) => ({ weekday: weekday as OpeningWindow["weekday"], opensAt, closesAt, isEmergency }));
const everyDay = (opensAt: string, closesAt: string): OpeningWindow[] =>
  [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday: weekday as OpeningWindow["weekday"], opensAt, closesAt, isEmergency: false }));

const starts = (slots: { startsAt: string }[]) => slots.map((slot) => slot.startsAt);

// Torsdag 15. oktober 2026: 08:00-16:00 lokal = 06:00Z-14:00Z.
const THURSDAY = { from: at("2026-10-15T00:00:00Z"), to: at("2026-10-15T23:59:00Z") };

describe("AvailabilityService.slots: åbningsvinduer og varighed", () => {
  it("giver starttider på hele kvarterer i vinduet, og ydelsen skal være færdig, når vinduet lukker", () => {
    const slots = service().slots({ openingHours: weekdays("08:00", "16:00"), busy: [], durationMin: 30, isEmergency: false, ...THURSDAY });
    expect(slots[0]).toEqual({ startsAt: "2026-10-15T06:00:00.000Z", endsAt: "2026-10-15T06:30:00.000Z" });
    // Sidste start er 15:30 lokal (13:30Z); 15:45 ville slutte efter lukketid.
    expect(slots.at(-1)?.startsAt).toBe("2026-10-15T13:30:00.000Z");
    expect(slots).toHaveLength(31); // hvert kvarter fra 08:00 til 15:30
    for (const slot of slots) expect(new Date(slot.startsAt).getUTCMinutes() % 15).toBe(0);
  });

  it("tager højde for behandlingens varighed", () => {
    const slots = service().slots({ openingHours: weekdays("08:00", "16:00"), busy: [], durationMin: 90, isEmergency: false, ...THURSDAY });
    expect(slots.at(-1)?.startsAt).toBe("2026-10-15T12:30:00.000Z"); // 14:30 lokal + 90 min = 16:00
    expect(slots.at(-1)?.endsAt).toBe("2026-10-15T14:00:00.000Z");
  });

  it("giver ingen tider uden vindue den dag eller uden åbningstider", () => {
    const saturday = { from: at("2026-10-17T00:00:00Z"), to: at("2026-10-17T23:59:00Z") };
    expect(service().slots({ openingHours: weekdays("08:00", "16:00"), busy: [], durationMin: 30, isEmergency: false, ...saturday })).toEqual([]);
    expect(service().slots({ openingHours: [], busy: [], durationMin: 30, isEmergency: false, ...THURSDAY })).toEqual([]);
  });

  it("afviser ugyldig varighed", () => {
    for (const durationMin of [0, -15, 10.5]) {
      expect(service().slots({ openingHours: weekdays("08:00", "16:00"), busy: [], durationMin, isEmergency: false, ...THURSDAY })).toEqual([]);
    }
  });

  it("sætter ikke tider over to vinduer sammen og kan have flere vinduer pr. dag", () => {
    const openingHours = [
      ...weekdays("08:00", "10:00"),
      ...weekdays("13:00", "14:00"),
    ];
    const slots = service().slots({ openingHours, busy: [], durationMin: 60, isEmergency: false, ...THURSDAY });
    expect(starts(slots)).toEqual([
      "2026-10-15T06:00:00.000Z", "2026-10-15T06:15:00.000Z", "2026-10-15T06:30:00.000Z", "2026-10-15T06:45:00.000Z",
      "2026-10-15T07:00:00.000Z", // 09:00 lokal, slutter 10:00
      "2026-10-15T11:00:00.000Z", // 13:00 lokal, slutter 14:00
    ]);
  });
});

describe("AvailabilityService.slots: akutvinduer", () => {
  const openingHours: OpeningWindow[] = [
    ...weekdays("08:00", "16:00"),
    { weekday: 6, opensAt: "10:00", closesAt: "12:00", isEmergency: true },
    { weekday: 4, opensAt: "16:00", closesAt: "18:00", isEmergency: true },
  ];
  const saturday = { from: at("2026-10-17T00:00:00Z"), to: at("2026-10-17T23:59:00Z") };

  it("almindelige ydelser bruger kun almindelige vinduer", () => {
    expect(service().slots({ openingHours, busy: [], durationMin: 30, isEmergency: false, ...saturday })).toEqual([]);
    const thursday = service().slots({ openingHours, busy: [], durationMin: 30, isEmergency: false, ...THURSDAY });
    expect(thursday.at(-1)?.startsAt).toBe("2026-10-15T13:30:00.000Z"); // ikke akutvinduet 16:00-18:00
  });

  it("akutydelser bruger både akutte og almindelige vinduer", () => {
    const sat = service().slots({ openingHours, busy: [], durationMin: 30, isEmergency: true, ...saturday });
    expect(sat[0].startsAt).toBe("2026-10-17T08:00:00.000Z"); // 10:00 lokal
    expect(sat).toHaveLength(7); // 10:00 … 11:30
    const thursday = service().slots({ openingHours, busy: [], durationMin: 30, isEmergency: true, ...THURSDAY });
    expect(thursday.at(-1)?.startsAt).toBe("2026-10-15T15:30:00.000Z"); // 17:30 lokal
    expect(thursday).toHaveLength(31 + 7);
  });
});

describe("AvailabilityService.slots: optaget tid og blokeringer", () => {
  const base = { openingHours: weekdays("08:00", "16:00"), durationMin: 30, isEmergency: false, ...THURSDAY };

  it("udelader tider, der overlapper optaget tid eller en blokering, men ikke tider der støder op til den", () => {
    // 09:00-10:00 lokal.
    const busy = [{ startsAt: "2026-10-15T07:00:00Z", endsAt: "2026-10-15T08:00:00Z" }];
    const got = starts(service().slots({ ...base, busy }));
    expect(got).toContain("2026-10-15T06:30:00.000Z"); // slutter 07:00, støder op
    expect(got).not.toContain("2026-10-15T06:45:00.000Z"); // slutter 07:15, overlapper
    expect(got).not.toContain("2026-10-15T07:00:00.000Z");
    expect(got).not.toContain("2026-10-15T07:45:00.000Z");
    expect(got).toContain("2026-10-15T08:00:00.000Z"); // starter, når den optagede tid slutter
  });

  it("behandler en ikke-udløbet reservation (held) og en blokering som optaget tid", () => {
    // public_busy_intervals() leverer ikke-udløbne `held`- og `booked`-bookinger samt blokeringer som almindelige intervaller.
    const held = { startsAt: "2026-10-15T06:00:00Z", endsAt: "2026-10-15T06:30:00Z" };
    const block = { startsAt: "2026-10-15T12:00:00Z", endsAt: "2026-10-15T14:00:00Z" };
    const got = starts(service().slots({ ...base, busy: [held, block] }));
    expect(got[0]).toBe("2026-10-15T06:30:00.000Z");
    expect(got.at(-1)).toBe("2026-10-15T11:30:00.000Z");
  });

  it("giver ingen første ledige tid, når hele dagen er optaget", () => {
    const busy = [{ startsAt: "2026-10-15T00:00:00Z", endsAt: "2026-10-16T00:00:00Z" }];
    expect(service().firstSlot({ ...base, busy })).toBeNull();
  });

  it("ignorerer ulæselige intervaller", () => {
    const busy = [{ startsAt: "ikke en dato", endsAt: "2026-10-15T07:00:00Z" }];
    expect(service().slots({ ...base, busy })).toHaveLength(31);
  });
});

describe("AvailabilityService.slots: varsel og horisont", () => {
  const openingHours = weekdays("08:00", "16:00");

  it("kræver 30 minutters varsel for almindelige ydelser", () => {
    const now = at("2026-10-15T05:50:00Z"); // 07:50 lokal; tidligst 08:20 => første kvarter 08:30
    const first = service(now).firstSlot({ openingHours, busy: [], durationMin: 30, isEmergency: false, from: now, to: at("2026-10-16T00:00:00Z") });
    expect(first?.startsAt).toBe("2026-10-15T06:30:00.000Z");
  });

  it("kræver intet varsel for akutydelser", () => {
    const now = at("2026-10-15T06:10:00Z"); // 08:10 lokal
    const query = { openingHours, busy: [], durationMin: 30, from: now, to: at("2026-10-16T00:00:00Z") };
    expect(service(now).firstSlot({ ...query, isEmergency: true })?.startsAt).toBe("2026-10-15T06:15:00.000Z");
    expect(service(now).firstSlot({ ...query, isEmergency: false })?.startsAt).toBe("2026-10-15T06:45:00.000Z");
  });

  it("tillader en starttid på nøjagtigt varslet", () => {
    const now = at("2026-10-15T06:00:00Z");
    const first = service(now).firstSlot({ openingHours, busy: [], durationMin: 30, isEmergency: false, from: now, to: at("2026-10-16T00:00:00Z") });
    expect(first?.startsAt).toBe("2026-10-15T06:30:00.000Z");
  });

  it("respekterer from", () => {
    const first = service().firstSlot({ openingHours, busy: [], durationMin: 30, isEmergency: false, from: at("2026-10-15T09:10:00Z"), to: at("2026-10-16T00:00:00Z") });
    expect(first?.startsAt).toBe("2026-10-15T09:15:00.000Z");
  });

  it("giver ingen tider efter horisonten på 60 dage, og sidste mulige start er inklusiv", () => {
    const slots = service().slots({
      openingHours: everyDay("00:00", "23:45"),
      busy: [],
      durationMin: 15,
      isEmergency: false,
      from: NOW,
      to: new Date(NOW.getTime() + (BOOKING_HORIZON_DAYS + 5) * 24 * 3600 * 1000),
    });
    expect(slots.at(-1)?.startsAt).toBe(new Date(NOW.getTime() + BOOKING_HORIZON_DAYS * 24 * 3600 * 1000).toISOString());
  });

  it("slutningen af intervallet er eksklusiv", () => {
    const slots = service().slots({ openingHours, busy: [], durationMin: 30, isEmergency: false, from: at("2026-10-15T06:00:00Z"), to: at("2026-10-15T06:30:00Z") });
    expect(starts(slots)).toEqual(["2026-10-15T06:00:00.000Z", "2026-10-15T06:15:00.000Z"]);
  });

  it("begrænser antallet med limit", () => {
    expect(service().slots({ openingHours, busy: [], durationMin: 30, isEmergency: false, ...THURSDAY, limit: 3 })).toHaveLength(3);
  });
});

describe("AvailabilityService: sommertid (Europe/Copenhagen)", () => {
  const hour = { openingHours: everyDay("08:00", "09:00"), busy: [], durationMin: 60, isEmergency: false };

  it("åbningstiden følger lokal tid, når der skiftes til sommertid (29. marts 2026)", () => {
    const now = at("2026-03-27T00:00:00Z");
    const slots = service(now).slots({ ...hour, from: at("2026-03-28T00:00:00Z"), to: at("2026-03-31T00:00:00Z") });
    expect(starts(slots)).toEqual([
      "2026-03-28T07:00:00.000Z", // lørdag, vintertid: 08:00 lokal = 07:00Z
      "2026-03-29T06:00:00.000Z", // søndag, efter skiftet: 08:00 lokal = 06:00Z
      "2026-03-30T06:00:00.000Z",
    ]);
  });

  it("åbningstiden følger lokal tid, når der skiftes til vintertid (25. oktober 2026)", () => {
    const slots = service().slots({ ...hour, from: at("2026-10-24T00:00:00Z"), to: at("2026-10-27T00:00:00Z") });
    expect(starts(slots)).toEqual([
      "2026-10-24T06:00:00.000Z", // sommertid
      "2026-10-25T07:00:00.000Z", // vintertid
      "2026-10-26T07:00:00.000Z",
    ]);
  });

  it("regner natten over skiftet med rigtig forløbet tid", () => {
    // Akutvindue 01:00-05:00 lokal den 29. marts 2026. Kl. 02:00-03:00 findes ikke; en time fra 01:30 lokal slutter 03:30.
    const openingHours: OpeningWindow[] = [{ weekday: 7, opensAt: "01:00", closesAt: "05:00", isEmergency: true }];
    const now = at("2026-03-28T12:00:00Z");
    const slots = service(now).slots({ openingHours, busy: [], durationMin: 60, isEmergency: true, from: at("2026-03-29T00:00:00Z"), to: at("2026-03-29T12:00:00Z") });
    expect(slots[0].startsAt).toBe("2026-03-29T00:00:00.000Z"); // 01:00 lokal
    expect(slots.at(-1)?.endsAt).toBe("2026-03-29T03:00:00.000Z"); // 05:00 lokal
    for (const slot of slots) expect(new Date(slot.startsAt).getUTCMinutes() % 15).toBe(0);
  });
});

describe("AvailabilityService.searchRange", () => {
  it("søger FIRST_AVAILABLE_SEARCH_DAYS dage frem fra nu", () => {
    const range = service().searchRange();
    expect(range.from).toEqual(NOW);
    expect(range.to.getTime() - range.from.getTime()).toBe(FIRST_AVAILABLE_SEARCH_DAYS * 24 * 3600 * 1000);
  });

  it("finder første ledige tid inden for søgevinduet og ikke efter", () => {
    const { from, to } = service().searchRange();
    const openingHours = weekdays("08:00", "16:00");
    // Optaget i hele søgevinduet => ingen ledig tid ("Ingen ledige tider de næste 14 dage").
    const busy = [{ startsAt: from.toISOString(), endsAt: to.toISOString() }];
    expect(service().firstSlot({ openingHours, busy, durationMin: 30, isEmergency: false, from, to })).toBeNull();
    expect(service().firstSlot({ openingHours, busy: [], durationMin: 30, isEmergency: false, from, to })?.startsAt).toBe("2026-10-14T08:30:00.000Z");
  });
});

describe("AvailabilityService.resolveRange og durationFor", () => {
  it("uden grænser dækker tidsrummet 14 dage fra nu", () => {
    const range = service().resolveRange();
    if (!range.ok) throw new Error("forventede et tidsrum");
    expect(range.from.toISOString()).toBe(NOW.toISOString());
    expect(range.to.getTime() - range.from.getTime()).toBe(14 * 24 * 3_600_000);
  });

  it("afviser slutning før start og mere end 14 dage", () => {
    expect(service().resolveRange("2026-10-15T00:00:00Z", "2026-10-14T00:00:00Z").ok).toBe(false);
    expect(service().resolveRange("2026-10-15T00:00:00Z", "2026-10-29T00:00:01Z").ok).toBe(false);
    const exact = service().resolveRange("2026-10-15T00:00:00Z", "2026-10-29T00:00:00Z");
    expect(exact.ok).toBe(true);
  });

  it("standardstart, standardlængde og maks antal dage kan angives (klinikkens kalender)", () => {
    const defaultFrom = new Date(NOW.getTime() - 7 * 24 * 3_600_000);
    const range = service().resolveRange(undefined, undefined, { defaultFrom, defaultDays: 67, maxDays: 92 });
    if (!range.ok) throw new Error("forventede et tidsrum");
    expect(range.from.toISOString()).toBe(defaultFrom.toISOString());
    expect(range.to.getTime() - range.from.getTime()).toBe(67 * 24 * 3_600_000);
    expect(service().resolveRange("2026-10-01T00:00:00Z", "2026-12-31T00:00:00Z", { maxDays: 92 }).ok).toBe(true); // 91 dage
    const tooLong = service().resolveRange("2026-10-01T00:00:00Z", "2027-01-05T00:00:00Z", { maxDays: 92 });
    expect(tooLong.ok).toBe(false);
    if (!tooLong.ok) expect(tooLong.message).toContain("92");
  });

  it("varigheden er klinikkens egen, ellers katalogets, lagt sammen", () => {
    const prices = [{ serviceId: "a", durationMin: 45 }];
    expect(service().durationFor(prices, [{ id: "a", defaultDurationMin: 30 }, { id: "b", defaultDurationMin: 20 }])).toBe(65);
    expect(service().durationFor([], [{ id: "b", defaultDurationMin: 20 }])).toBe(20);
  });
});
