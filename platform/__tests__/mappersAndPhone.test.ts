import { describe, expect, it } from "vitest";
import { MODERATION_LABEL } from "@/lib/booking/constants/reviews";
import { phoneSchema } from "@/lib/common/schemas/phone";
import { toClinicBookingDto, type ClinicBookingFields } from "@/platform/db/mappers";

const NOW = new Date("2026-10-20T12:00:00Z");
const fields = (status: ClinicBookingFields["status"]): ClinicBookingFields => ({
  id: "b1",
  leadId: "l1",
  serviceId: "s1",
  serviceName: "Undersøgelse",
  startsAt: "2026-10-21T10:00:00+00:00",
  endsAt: "2026-10-21T10:30:00+00:00",
  status,
  holdExpiresAt: null,
  contactName: "Alma Test",
  contactPhone: "+45 12 34 56 78",
  contactEmail: "alma@test.invalid",
});

describe("toClinicBookingDto: kontaktfelter (security trin 6, L1)", () => {
  it("giver kun contact ved booked og completed", () => {
    expect(toClinicBookingDto(fields("booked"), NOW).contact).toEqual({ name: "Alma Test", phone: "+45 12 34 56 78", email: "alma@test.invalid" });
    expect(toClinicBookingDto(fields("completed"), NOW).contact).not.toBeNull();
    for (const status of ["held", "cancelled", "no_show"] as const) expect(toClinicBookingDto(fields(status), NOW).contact).toBeNull();
  });

  it("giver ingen contact, når databasen ikke giver felterne, og normaliserer tider til ISO med Z", () => {
    const dto = toClinicBookingDto({ ...fields("booked"), contactName: null, contactPhone: null, contactEmail: null }, NOW);
    expect(dto.contact).toBeNull();
    expect(dto.startsAt).toBe("2026-10-21T10:00:00.000Z");
    expect(dto.canCancel).toBe(true);
  });
});

describe("toClinicBookingDto: hvem der aflyste (10.10)", () => {
  it("giver cancelledBy og klinikkens grund kun for en aflyst booking", () => {
    const byClinic = toClinicBookingDto({ ...fields("cancelled"), cancelledBy: "clinic", cancelReason: "Tandlægen er syg" }, NOW);
    expect(byClinic.cancelledBy).toBe("clinic");
    expect(byClinic.cancelReason).toBe("Tandlægen er syg");
    expect(byClinic.contact).toBeNull();
    expect(toClinicBookingDto({ ...fields("cancelled"), cancelledBy: "patient", cancelReason: null }, NOW).cancelledBy).toBe("patient");
    // En udløbet reservation har cancelled_by = null i databasen.
    expect(toClinicBookingDto({ ...fields("cancelled"), cancelledBy: null, cancelReason: null }, NOW).cancelledBy).toBe("system");
    // Andre statusser har aldrig cancelledBy eller grund, selv hvis rækken skulle have felterne.
    const booked = toClinicBookingDto({ ...fields("booked"), cancelledBy: "clinic", cancelReason: "x" }, NOW);
    expect(booked.cancelledBy).toBeNull();
    expect(booked.cancelReason).toBeNull();
  });

  it("giver null, når kilden ikke kender felterne (clinic_lead_detail())", () => {
    const dto = toClinicBookingDto(fields("cancelled"), NOW);
    expect(dto.cancelledBy).toBeNull();
    expect(dto.cancelReason).toBeNull();
  });
});

describe("phoneSchema: mindst 8 cifre (security trin 6, L2)", () => {
  it("accepterer gyldige danske numre", () => {
    for (const phone of ["12345678", "12 34 56 78", "+45 12 34 56 78", "(+45) 1234-5678"]) expect(phoneSchema.safeParse(phone).success).toBe(true);
  });
  it("afviser for få cifre og tegn uden cifre", () => {
    for (const phone of ["((((((", "+ - ( ) +", "1234567", "+45 1234", "abc12345678"]) expect(phoneSchema.safeParse(phone).success).toBe(false);
  });
});

describe("MODERATION_LABEL", () => {
  it("har dansk tekst for alle statusser", () => {
    expect(Object.keys(MODERATION_LABEL).sort()).toEqual(["approved", "pending", "rejected"]);
  });
});
