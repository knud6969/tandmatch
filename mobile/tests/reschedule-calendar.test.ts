import { patientCancellationText, patientRescheduledFromText } from "@/lib/booking/domain/bookings";
import { SLOT_TAKEN_TEXT } from "@/lib/common/constants/error-texts";
import { ApiRequestError } from "~/api/client";
import { rescheduleFailure } from "~/utils/booking-form";
import { addBookingToCalendar, isCalendarAvailable } from "~/utils/calendar";
import { canAddToCalendar } from "~/utils/calendar-button";

// Expo Calendar er ikke installeret i alle miljøer; modulet mockes, så testen ikke afhænger af den native pakke.
const mockCreateEvent = jest.fn(async () => ({ action: "saved" }));
const mockIsAvailable = jest.fn(async () => true);
jest.mock("expo-calendar", () => ({ createEventInCalendarAsync: (...a: unknown[]) => mockCreateEvent(...(a as [])), isAvailableAsync: () => mockIsAvailable() }), { virtual: true });

const NOW = new Date("2026-10-25T12:00:00Z");

describe("flyttet tid på bookingkortet (13.12)", () => {
  it("den gamle booking siger Du flyttede tiden til …, en almindelig aflysning Du aflyste tiden", () => {
    expect(patientCancellationText({ cancelledBy: "patient", cancelReason: null, rescheduledTo: "2026-10-26T08:15:00Z" })).toBe("Du flyttede tiden til man. 26. okt. kl. 09.15");
    expect(patientCancellationText({ cancelledBy: "patient", cancelReason: null, rescheduledTo: null })).toBe("Du aflyste tiden");
  });
  it("den nye booking siger Flyttet fra …", () => {
    expect(patientRescheduledFromText({ rescheduledFrom: "2026-10-26T08:15:00Z" })).toBe("Flyttet fra man. 26. okt. kl. 09.15");
  });
});

describe("rescheduleFailure", () => {
  it("SLOT_TAKEN henter tiderne igen; BOOKING_NOT_RESCHEDULABLE henviser til klinikken", () => {
    const taken = rescheduleFailure(new ApiRequestError(409, "SLOT_TAKEN", ""));
    expect(taken).toMatchObject({ message: SLOT_TAKEN_TEXT, refetchSlots: true, clearSlot: true, notReschedulable: false });
    const blocked = rescheduleFailure(new ApiRequestError(409, "BOOKING_NOT_RESCHEDULABLE", ""));
    expect(blocked.notReschedulable).toBe(true);
    expect(blocked.message).toContain("Kontakt klinikken i beskedtråden");
  });
});

describe("Tilføj til kalender (13.11)", () => {
  it("vises kun for en booket tid før starttid, og kun når kalenderen er tilgængelig", () => {
    const future = { status: "booked" as const, startsAt: "2026-10-26T08:00:00Z" };
    expect(canAddToCalendar(future, true, NOW)).toBe(true);
    expect(canAddToCalendar(future, false, NOW)).toBe(false);
    expect(canAddToCalendar({ ...future, startsAt: "2026-10-24T08:00:00Z" }, true, NOW)).toBe(false);
    for (const status of ["held", "completed", "no_show", "cancelled"] as const) expect(canAddToCalendar({ ...future, status }, true, NOW)).toBe(false);
  });

  it("åbner systemets skærm med titel uden behandling, og fejl i tilgængelighed tæller som nej", async () => {
    await addBookingToCalendar({
      clinic: { id: "c", name: "Nørrebro Tandklinik", address: "Nørrebrogade 1", city: "København N" },
      startsAt: "2026-10-26T08:00:00.000Z",
      endsAt: "2026-10-26T08:30:00.000Z",
    });
    const event = (mockCreateEvent.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(event.title).toBe("Tandlægetid hos Nørrebro Tandklinik");
    expect(JSON.stringify(event)).not.toMatch(/behandling|rod|krone/i);
    expect(await isCalendarAvailable()).toBe(true);
    mockIsAvailable.mockRejectedValueOnce(new Error("nej"));
    expect(await isCalendarAvailable()).toBe(false);
  });
});
