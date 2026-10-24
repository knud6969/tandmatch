import { BOOKING_STATUS_LABEL } from "@/lib/booking/constants/bookings";
import type { PatientBookingDto } from "@/lib/booking/types/bookings";
import { LEAD_STATUS_LABEL } from "@/lib/leads/constants/leads";
import { SLOT_TAKEN_TEXT, SLOT_UNAVAILABLE_TEXT, BOOKING_LIMIT_TEXT } from "@/lib/common/constants/error-texts";
import { bookSlot, getLeadAvailability, listBookings } from "~/api/bookings";
import { listClinics } from "~/api/clinics";
import { ApiRequestError } from "~/api/client";
import { saveSession, saveTermsToken } from "~/auth/tokens";
import { bookingFailure, groupSlotsByDay, parseBooking, splitBookings } from "~/utils/booking-form";
import { canBookLead, caseRoute, caseStatusLine, caseTitle, declineText, leadTone } from "~/utils/case-view";
import { buildClinicsQuery, DEFAULT_FILTERS, showOtherClinics } from "~/utils/clinic-filters";

const mockStore = new Map<string, string>();
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async (key: string) => mockStore.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => void mockStore.set(key, value)),
  deleteItemAsync: jest.fn(async (key: string) => void mockStore.delete(key)),
}));

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
let calls: { url: string; init: RequestInit }[];
let responses: (() => Response)[];

beforeEach(async () => {
  mockStore.clear();
  calls = [];
  responses = [];
  process.env.EXPO_PUBLIC_API_URL = "http://api.test";
  global.fetch = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return (responses.shift() ?? (() => json(500)))();
  }) as typeof fetch;
  await saveTermsToken("t");
  await saveSession({ accessToken: "tok", refreshToken: "r", expiresAt: new Date(Date.now() + 3_600_000).toISOString() });
});

const UUID = "11111111-1111-4111-8111-111111111111";

describe("klinikoversigten med sagens behandlinger", () => {
  it("kalder /api/clinics med services, postnummer og onlyOffering=true, og uden onlyOffering for 'vis også andre'", async () => {
    responses.push(() => json(200, { clinics: [], sort: "rating", criteria: [] }), () => json(200, { clinics: [], sort: "rating", criteria: [] }));
    const filters = { ...DEFAULT_FILTERS, serviceSlugs: ["fast_bojle"], postalCode: "2100" };
    await listClinics(buildClinicsQuery(filters));
    await listClinics(buildClinicsQuery(showOtherClinics(filters)));
    expect(calls[0].url).toBe("http://api.test/api/clinics?services=fast_bojle&postalCode=2100&maxDistanceKm=50&onlyOffering=true");
    expect(calls[1].url).toBe("http://api.test/api/clinics?services=fast_bojle&postalCode=2100&maxDistanceKm=50");
  });
});

describe("sager og leads", () => {
  it("bruger lib's statuslabels og farver", () => {
    expect(LEAD_STATUS_LABEL.accepted).toBe("Accepteret");
    expect(leadTone("accepted")).toBe("success");
    expect(leadTone("declined")).toBe("danger");
    expect(leadTone("sent")).toBe("info");
  });

  it("statuslinjen tæller leads pr. status med lib's labels", () => {
    const line = caseStatusLine({
      status: "submitted",
      leads: [
        { id: "1", clinicName: "A", status: "sent", removed: false },
        { id: "2", clinicName: "B", status: "accepted", removed: false },
        { id: "3", clinicName: "C", status: "sent", removed: false },
      ],
    });
    expect(line).toBe("2 afventer svar, 1 accepteret");
    expect(caseStatusLine({ status: "draft", leads: [] })).toBe("Ikke sendt endnu");
  });

  it("titel, rute og booking-knap", () => {
    expect(caseTitle({ serviceNames: ["Blegning", "Facing"], isEmergency: false })).toBe("Blegning, Facing");
    expect(caseTitle({ serviceNames: [], isEmergency: true })).toBe("Akut henvendelse");
    expect(caseRoute({ id: "c", status: "draft" }).pathname).toBe("/sag/[caseId]/flow");
    expect(caseRoute({ id: "c", status: "submitted" }).pathname).toBe("/sag/[caseId]");
    const clinic = { id: "k", name: "K", city: "By", logoUrl: null, removed: false };
    expect(canBookLead({ status: "accepted", clinic })).toBe(true);
    expect(canBookLead({ status: "sent", clinic })).toBe(false);
    expect(canBookLead({ status: "booked", clinic })).toBe(false);
  });

  it("afvisningen viser årsag og klinikkens note", () => {
    expect(declineText({ declineReason: "no_capacity", declineNote: null })).toBe("Klinikken har ikke kapacitet lige nu");
    expect(declineText({ declineReason: "other", declineNote: "Ring til os" })).toBe("Anden begrundelse: Ring til os");
    expect(declineText({ declineReason: null, declineNote: null })).toBeNull();
  });
});

describe("booking", () => {
  it("grupperer ledige tider pr. dag i dansk tid", () => {
    const days = groupSlotsByDay([
      { startsAt: "2026-10-27T08:15:00.000Z", endsAt: "2026-10-27T08:45:00.000Z" },
      { startsAt: "2026-10-26T07:00:00.000Z", endsAt: "2026-10-26T07:30:00.000Z" },
      { startsAt: "2026-10-26T08:00:00.000Z", endsAt: "2026-10-26T08:30:00.000Z" },
    ]);
    expect(days.map((d) => [d.key, d.slots.length])).toEqual([["2026-10-26", 2], ["2026-10-27", 1]]);
  });

  it("validerer navn og telefon (mindst 8 cifre) med lib's skema", () => {
    const base = { serviceId: UUID, startsAt: "2026-10-26T07:00:00.000Z", contactName: "Mette", contactPhone: "12345678" };
    expect(parseBooking(base).ok).toBe(true);
    const bad = parseBooking({ ...base, contactPhone: "1234", contactName: "" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(Object.keys(bad.errors).sort()).toEqual(["contactName", "contactPhone"]);
    const none = parseBooking({ ...base, startsAt: null });
    expect(none.ok).toBe(false);
    if (!none.ok) expect(none.errors.startsAt).toBeTruthy();
  });

  it("henter ledige tider og booker med de rigtige kald", async () => {
    responses.push(() => json(200, { slots: [{ startsAt: "2026-10-26T07:00:00.000Z", endsAt: "2026-10-26T07:30:00.000Z" }] }), () => json(201, { id: "b" }), () => json(200, { bookings: [] }));
    expect(await getLeadAvailability("lead1", UUID)).toHaveLength(1);
    await bookSlot("lead1", { serviceId: UUID, startsAt: "2026-10-26T07:00:00.000Z", contactName: "Mette", contactPhone: "12345678" });
    expect(await listBookings()).toEqual([]);
    expect(calls[0].url).toBe(`http://api.test/api/leads/lead1/availability?serviceId=${UUID}`);
    expect(calls[1].url).toBe("http://api.test/api/leads/lead1/booking");
    expect(calls[1].init.method).toBe("POST");
    expect(calls[2].url).toBe("http://api.test/api/bookings");
  });

  it("booking-fejl: SLOT_TAKEN henter tiderne igen, SLOT_UNAVAILABLE og BOOKING_LIMIT gør ikke", async () => {
    const attempt = async (code: string) => {
      responses.push(() => json(409, { error: { code, message: "x" } }));
      try {
        await bookSlot("lead1", { serviceId: UUID, startsAt: "2026-10-26T07:00:00.000Z", contactName: "Mette", contactPhone: "12345678" });
      } catch (e) {
        expect(e).toBeInstanceOf(ApiRequestError);
        return bookingFailure(e);
      }
      throw new Error("skulle fejle");
    };
    expect(await attempt("SLOT_TAKEN")).toEqual({ message: SLOT_TAKEN_TEXT, refetchSlots: true, clearSlot: true });
    expect(await attempt("SLOT_UNAVAILABLE")).toEqual({ message: SLOT_UNAVAILABLE_TEXT, refetchSlots: false, clearSlot: true });
    expect(await attempt("BOOKING_LIMIT")).toEqual({ message: BOOKING_LIMIT_TEXT, refetchSlots: false, clearSlot: false });
  });

  it("deler bookinger i kommende og tidligere", () => {
    const mk = (id: string, startsAt: string, endsAt: string, status: PatientBookingDto["status"]): PatientBookingDto => ({
      id, leadId: "l", clinic: { id: "c", name: "K", address: "A", city: "B" }, service: { id: "s", name: "S" },
      startsAt, endsAt, status, canCancel: false, canReview: false, holdExpiresAt: null,
    });
    const now = new Date("2026-10-25T12:00:00Z");
    const { upcoming, past } = splitBookings(
      [
        mk("late", "2026-11-02T08:00:00Z", "2026-11-02T08:30:00Z", "booked"),
        mk("soon", "2026-10-27T08:00:00Z", "2026-10-27T08:30:00Z", "booked"),
        mk("done", "2026-10-20T08:00:00Z", "2026-10-20T08:30:00Z", "completed"),
        mk("cancelled", "2026-10-28T08:00:00Z", "2026-10-28T08:30:00Z", "cancelled"),
      ],
      now,
    );
    expect(upcoming.map((b) => b.id)).toEqual(["soon", "late"]);
    expect(past.map((b) => b.id)).toEqual(["cancelled", "done"]);
    expect(BOOKING_STATUS_LABEL.cancelled).toBe("Aflyst");
  });
});
