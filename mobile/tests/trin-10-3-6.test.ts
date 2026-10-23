import { MESSAGE_LIMIT_TEXT } from "@/lib/common/constants/error-texts";
import type { MessageDto } from "@/lib/leads/types/messages";
import type { ClinicListItemDto } from "@/lib/clinics/types/clinics";
import type { ServiceGroupDto } from "@/lib/clinics/types/services";
import { sendEmergencyLead, getClinicAvailability } from "~/api/emergency";
import { closeCase } from "~/api/cases";
import { withdrawLead } from "~/api/leads";
import { cancelBooking } from "~/api/bookings";
import { createReview, listEligibleReviews } from "~/api/reviews";
import { listMessages, sendMessage } from "~/api/messages";
import { saveSession, saveTermsToken } from "~/auth/tokens";
import {
  CLOSE_CASE_CONSEQUENCE,
  canCancelBooking,
  canCloseCase,
  canMessageLead,
  canReviewBooking,
  canWithdrawLead,
  messagesLabel,
} from "~/utils/case-actions";
import { emergencyClinicsQuery, emergencyServices, parseEmergency, selectableEmergencyClinics } from "~/utils/emergency-form";
import { appendMessage, canWriteToLead, messagesChanged, senderLabel, sortMessages } from "~/utils/message-view";
import { EMPTY_REVIEW, parseActualPrice, parseReview } from "~/utils/review-form";

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
const clinic = { id: "k", name: "K", city: "By", logoUrl: null, removed: false };
const msg = (id: string, createdAt: string, fromMe = true): MessageDto => ({ id, fromMe, senderRole: fromMe ? "patient" : "clinic", body: id, createdAt, readAt: null });

describe("10.3 anmeldelse", () => {
  const valid = { ...EMPTY_REVIEW, stars: 4, text: "Rolig modtagelse og klar information.", priceAccuracy: "as_quoted" as const };

  it("godkender en gyldig anmeldelse og sender kun valgfrie felter, der er udfyldt", () => {
    const parsed = parseReview(UUID, valid);
    expect(parsed).toEqual({ ok: true, data: { bookingId: UUID, stars: 4, text: "Rolig modtagelse og klar information.", priceAccuracy: "as_quoted" } });
  });

  it("sender faktisk pris og manglende gennemsigtighed med kommentar", () => {
    const parsed = parseReview(UUID, { ...valid, actualPrice: "1.250 kr", lackedTransparency: true, transparencyComment: " Intet skriftligt " });
    expect(parsed).toMatchObject({ ok: true, data: { actualPrice: 1250, lackedTransparency: true, transparencyComment: "Intet skriftligt" } });
  });

  it("giver fejl ved felterne: ingen stjerner, for kort tekst, intet prisvalg, ugyldig pris", () => {
    const parsed = parseReview(UUID, { ...EMPTY_REVIEW, text: "kort", actualPrice: "abc" });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.errors.stars).toBe("Vælg 1 til 5 stjerner.");
      expect(parsed.errors.text).toContain("mindst 20 tegn");
      expect(parsed.errors.priceAccuracy).toBe("Vælg, om prisen svarede til prisoverslaget.");
      expect(parsed.errors.actualPrice).toBe("Angiv prisen i hele kroner.");
    }
  });

  it("omsætter pristekst", () => {
    expect(parseActualPrice("")).toBeUndefined();
    expect(parseActualPrice("1 250")).toBe(1250);
    expect(parseActualPrice("12,5")).toBeNaN();
  });

  it("kalder /api/reviews/eligible og POST /api/reviews", async () => {
    responses.push(() => json(200, { items: [{ bookingId: UUID }] }), () => json(201, { id: "r", moderationStatus: "pending" }));
    expect(await listEligibleReviews()).toEqual([{ bookingId: UUID }]);
    await createReview({ bookingId: UUID, stars: 5, text: "x".repeat(20), priceAccuracy: "as_quoted" });
    expect(calls[0].url).toBe("http://api.test/api/reviews/eligible");
    expect(calls[1].url).toBe("http://api.test/api/reviews");
    expect(calls[1].init.method).toBe("POST");
  });

  it("ALREADY_REVIEWED vises på dansk", async () => {
    responses.push(() => json(409, { error: { code: "ALREADY_REVIEWED", message: "x" } }));
    await expect(createReview({ bookingId: UUID, stars: 5, text: "x".repeat(20), priceAccuracy: "as_quoted" })).rejects.toThrow("Du har allerede anmeldt dette besøg.");
  });
});

describe("10.4 beskeder", () => {
  it("sorterer, tilføjer uden dubletter og ser ændringer", () => {
    const a = msg("a", "2026-10-23T10:00:00Z");
    const b = msg("b", "2026-10-23T11:00:00Z", false);
    expect(sortMessages([b, a]).map((m) => m.id)).toEqual(["a", "b"]);
    expect(appendMessage([a], b).map((m) => m.id)).toEqual(["a", "b"]);
    expect(appendMessage([a, b], b)).toHaveLength(2);
    expect(messagesChanged([a], [a])).toBe(false);
    expect(messagesChanged([a], [a, b])).toBe(true);
  });

  it("afsendernavne og hvornår der kan skrives", () => {
    expect(senderLabel({ fromMe: true })).toBe("Dig");
    expect(senderLabel({ fromMe: false })).toBe("Klinikken");
    expect(canWriteToLead("sent")).toBe(true);
    expect(canWriteToLead("booked")).toBe(true);
    expect(canWriteToLead("declined")).toBe(false);
    expect(canWriteToLead("withdrawn")).toBe(false);
  });

  it("kalder GET og POST på /api/leads/{id}/messages", async () => {
    responses.push(() => json(200, { messages: [msg("a", "2026-10-23T10:00:00Z")] }), () => json(201, msg("b", "2026-10-23T11:00:00Z")));
    expect(await listMessages(UUID)).toHaveLength(1);
    await sendMessage(UUID, { body: "Hej" });
    expect(calls[0].url).toBe(`http://api.test/api/leads/${UUID}/messages`);
    expect(JSON.parse(String(calls[1].init.body))).toEqual({ body: "Hej" });
  });

  it("MESSAGE_LIMIT og THREAD_CLOSED vises på dansk", async () => {
    responses.push(() => json(429, { error: { code: "MESSAGE_LIMIT", message: "x" } }), () => json(409, { error: { code: "THREAD_CLOSED", message: "x" } }));
    await expect(sendMessage(UUID, { body: "Hej" })).rejects.toThrow(MESSAGE_LIMIT_TEXT);
    await expect(sendMessage(UUID, { body: "Hej" })).rejects.toThrow("Samtalen er lukket");
  });
});

describe("10.5 træk tilbage, luk sag og aflys", () => {
  it("tilbyder handlingerne efter reglerne", () => {
    expect(canWithdrawLead({ status: "sent", clinic })).toBe(true);
    expect(canWithdrawLead({ status: "accepted", clinic })).toBe(false);
    expect(canWithdrawLead({ status: "sent", clinic: { ...clinic, removed: true } })).toBe(false);
    expect(canCloseCase("submitted")).toBe(true);
    expect(canCloseCase("draft")).toBe(false);
    expect(canCloseCase("closed")).toBe(false);
    expect(canCancelBooking({ canCancel: true })).toBe(true);
    expect(canReviewBooking({ canReview: false })).toBe(false);
    expect(canMessageLead({ status: "declined", clinic })).toBe(false);
    expect(canMessageLead({ status: "sent", clinic })).toBe(true);
    expect(messagesLabel(0)).toBe("Skriv til klinikken");
    expect(messagesLabel(1)).toBe("Skriv til klinikken (1 ny)");
    expect(messagesLabel(3)).toBe("Skriv til klinikken (3 nye)");
    expect(CLOSE_CASE_CONSEQUENCE).toContain("Bookede tider består");
  });

  it("kalder de rigtige endpoints med tom body", async () => {
    responses.push(() => json(200, {}), () => json(200, {}), () => json(200, {}));
    await withdrawLead(UUID);
    await closeCase(UUID);
    await cancelBooking(UUID);
    expect(calls.map((c) => c.url)).toEqual([
      `http://api.test/api/leads/${UUID}/withdraw`,
      `http://api.test/api/cases/${UUID}/close`,
      `http://api.test/api/bookings/${UUID}/cancel`,
    ]);
    expect(calls.every((c) => c.init.method === "POST" && c.init.body === "{}")).toBe(true);
  });

  it("LEAD_NOT_PENDING og BOOKING_NOT_CANCELLABLE vises på dansk", async () => {
    responses.push(() => json(409, { error: { code: "LEAD_NOT_PENDING", message: "x" } }), () => json(409, { error: { code: "BOOKING_NOT_CANCELLABLE", message: "x" } }));
    await expect(withdrawLead(UUID)).rejects.toThrow("allerede besvaret");
    await expect(cancelBooking(UUID)).rejects.toThrow("kan ikke aflyses længere");
  });
});

describe("10.6 akutvejen", () => {
  const groups = [
    { id: "g1", slug: "a", name: "A", description: "", services: [{ id: "s1", slug: "undersoegelse", name: "Undersøgelse", description: "", category: "general", defaultDurationMin: 30, groupId: "g1", groupSlug: "a" }] },
    { id: "g2", slug: "akut", name: "Akut", description: "", services: [{ id: "s2", slug: "akut_konsultation", name: "Akut konsultation", description: "", category: "emergency", defaultDurationMin: 30, groupId: "g2", groupSlug: "akut" }] },
  ] as ServiceGroupDto[];

  it("finder akutbehandlinger efter kategori", () => {
    expect(emergencyServices(groups).map((s) => s.slug)).toEqual(["akut_konsultation"]);
  });

  it("bygger klinikforespørgslen med akut og tidligste tid, og postnummer kun hvis gyldigt", () => {
    expect(emergencyClinicsQuery(null)).toBe("emergency=true&sort=first_available");
    expect(emergencyClinicsQuery("abc")).toBe("emergency=true&sort=first_available");
    expect(emergencyClinicsQuery("2100")).toBe("postalCode=2100&maxDistanceKm=50&emergency=true&sort=first_available");
  });

  it("vælger kun verificerede klinikker med akuttid", () => {
    const list = [
      { id: "1", canReceiveLeads: true, firstEmergencyAt: "2026-10-23T10:00:00Z" },
      { id: "2", canReceiveLeads: false, firstEmergencyAt: "2026-10-23T10:00:00Z" },
      { id: "3", canReceiveLeads: true, firstEmergencyAt: null },
    ] as ClinicListItemDto[];
    expect(selectableEmergencyClinics(list).map((c) => c.id)).toEqual(["1"]);
  });

  it("validerer formularen med serverens skema", () => {
    const ok = parseEmergency({ clinicId: UUID, serviceId: UUID, startsAt: "2026-10-23T10:00:00Z", description: "Voldsom tandpine i dag", contactName: "Anna", contactPhone: "12345678" });
    expect(ok.ok).toBe(true);
    const bad = parseEmergency({ clinicId: UUID, serviceId: null, startsAt: null, description: "kort", contactName: "", contactPhone: "1" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.errors.serviceId).toBe("Vælg en behandling.");
      expect(bad.errors.startsAt).toBe("Vælg en ledig tid.");
      expect(bad.errors.description).toContain("mindst 10 tegn");
      expect(bad.errors.contactName).toBeTruthy();
      expect(bad.errors.contactPhone).toBeTruthy();
    }
  });

  it("kalder availability og POST /api/emergency-leads", async () => {
    responses.push(() => json(200, { slots: [] }), () => json(201, { caseId: "c", lead: {} }));
    await getClinicAvailability(UUID, "s2");
    await sendEmergencyLead({ clinicId: UUID, serviceId: UUID, startsAt: "2026-10-23T10:00:00Z", description: "Voldsom tandpine i dag", contactName: "Anna", contactPhone: "12345678" });
    expect(calls[0].url).toBe(`http://api.test/api/clinics/${UUID}/availability?serviceId=s2`);
    expect(calls[1].url).toBe("http://api.test/api/emergency-leads");
  });

  it("ACCOUNT_REQUIRED og SLOT_TAKEN vises på dansk", async () => {
    const input = { clinicId: UUID, serviceId: UUID, startsAt: "2026-10-23T10:00:00Z", description: "Voldsom tandpine i dag", contactName: "Anna", contactPhone: "12345678" };
    responses.push(() => json(403, { error: { code: "ACCOUNT_REQUIRED", message: "x" } }), () => json(409, { error: { code: "SLOT_TAKEN", message: "x" } }));
    await expect(sendEmergencyLead(input)).rejects.toThrow("Opret en konto");
    await expect(sendEmergencyLead(input)).rejects.toThrow("Den tid blev lige optaget");
  });
});
