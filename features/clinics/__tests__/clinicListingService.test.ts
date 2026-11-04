import { describe, expect, it, vi } from "vitest";
import type { PublicClinicRecord } from "@/features/clinics/clinicDirectoryRepository";

vi.mock("server-only", () => ({}));
vi.mock("@/features/booking", () => ({ ReviewsRepository: class {} }));

const { ClinicListingService } = await import("@/features/clinics/clinicListingService");
const { AvailabilityService } = await import("@/features/clinics/availabilityService");
const { RankingService } = await import("@/features/clinics/rankingService");

// Torsdag 15. oktober 2026, 08:00 lokal.
const NOW = new Date("2026-10-15T06:00:00Z");
const weekdays = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday: weekday as 1, opensAt: "08:00", closesAt: "16:00", isEmergency: false }));

const exam = { id: "s-exam", slug: "undersoegelse", name: "Undersøgelse", category: "general", defaultDurationMin: 30 };
const emergency = { id: "s-akut", slug: "akut_konsultation", name: "Akut", category: "emergency", defaultDurationMin: 30 };

function record(tier: "full" | "basic", id: string): PublicClinicRecord {
  return {
    id,
    name: `Klinik ${id}`,
    tier,
    canReceiveLeads: tier === "full",
    address: "Testvej 1",
    postalCode: "2100",
    city: "København Ø",
    location: { lat: 55.7, lng: 12.5 },
    phone: null,
    website: null,
    openingHours: tier === "full" ? weekdays : [],
    trustpilot: null,
    logoUrl: "https://example.test/logo.png",
    prices: [{ serviceId: "s-exam", priceMin: 500, priceMax: 800, durationMin: 30 }],
    canReceiveLeadsReason: undefined,
  } as unknown as PublicClinicRecord;
}

function service() {
  const reviews = { reviewStats: vi.fn(async (ids: string[]) => new Map(ids.map((id) => [id, { reviewCount: 2, avgStars: 4.5, priceAccuracyPct: 90, distribution: null }]))) };
  const availability = { listBusyIntervals: vi.fn(async () => new Map()) };
  const services = { listGroups: vi.fn(async () => [{ services: [exam, emergency] }]) };
  const listing = new ClinicListingService({
    reviews: reviews as never,
    availability: availability as never,
    services: services as never,
    ranking: new RankingService(),
    slots: new AvailabilityService(() => NOW),
  });
  return { listing, reviews, availability };
}

describe("ClinicListingService", () => {
  it("uden valgte behandlinger måles første ledige tid for en undersøgelse, og der er ingen valgpriser", async () => {
    const { listing } = service();
    const plan = await listing.plan([]);
    expect(plan.selected).toEqual([]);
    expect(plan.appointment.map((s) => s.slug)).toEqual(["undersoegelse"]);
    expect(plan.emergency?.slug).toBe("akut_konsultation");
    const records = [record("full", "a")];
    const context = await listing.contextFor(records);
    const item = listing.toListItem(records[0], plan, context, null);
    expect(item.prices).toEqual([]);
    expect(item.priceForSelection).toBeNull();
    expect(item.distanceKm).toBeNull();
    expect(item.reviewStats?.reviewCount).toBe(2);
    expect(item.firstAvailableAt).not.toBeNull();
  });

  it("basisniveau får kun grunddata, og statistik hentes kun for verificerede klinikker", async () => {
    const { listing, reviews } = service();
    const plan = await listing.plan([]);
    const records = [record("basic", "b"), record("full", "a")];
    const context = await listing.contextFor(records);
    expect(reviews.reviewStats).toHaveBeenCalledWith(["a"]);
    const basic = listing.toListItem(records[0], plan, context, null);
    expect(basic.reviewStats).toBeNull();
    expect(basic.logoUrl).toBeNull();
    expect(basic.firstAvailableAt).toBeNull();
  });

  it("afviser en ukendt behandling", async () => {
    await expect(service().listing.plan(["findes-ikke"])).rejects.toMatchObject({ code: "UNKNOWN_SERVICE" });
  });
});
