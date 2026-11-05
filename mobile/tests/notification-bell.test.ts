import { INBOX_POLL_MS } from "@/lib/common/constants/notifications";
import { formatNotificationAge, formatUnreadBadge, renderInboxContent } from "@/lib/common/domain/notifications";
import { NOTIFICATION_FALLBACK_PATH } from "~/utils/notification-routing";
import { bellBadge, bellLabel, inboxItemTarget, needsMarking } from "~/utils/notification-inbox";

const CASE = "3f2b8c1e-9a4d-4e7b-8c55-0a1b2c3d4e5f";
const LEAD = "7a1b8c1e-9a4d-4e7b-8c55-0a1b2c3d4e5f";
const BOOKING = "9c1b8c1e-9a4d-4e7b-8c55-0a1b2c3d4e5f";

describe("klokkens tal og label (13.10)", () => {
  it("skjuler tallet ved 0 og viser 99+ over 99", () => {
    expect(bellBadge(0)).toBeNull();
    expect(bellBadge(3)).toBe("3");
    expect(bellBadge(99)).toBe("99");
    expect(bellBadge(100)).toBe("99+");
    expect(formatUnreadBadge(250)).toBe("99+");
  });

  it("skærmlæserens label nævner antallet", () => {
    expect(bellLabel(0)).toBe("Notifikationer");
    expect(bellLabel(1)).toBe("Notifikationer, 1 ulæste");
    expect(bellLabel(120)).toBe("Notifikationer, 99+ ulæste");
  });

  it("poller hvert 30. sekund", () => {
    expect(INBOX_POLL_MS).toBe(30_000);
  });
});

describe("tryk på en notifikation", () => {
  it("åbner kun tilladte stier, ellers Mine sager", () => {
    expect(inboxItemTarget({ path: `/sag/${CASE}` })).toBe(`/sag/${CASE}`);
    expect(inboxItemTarget({ path: `/sag/${CASE}/beskeder/${LEAD}` })).toBe(`/sag/${CASE}/beskeder/${LEAD}`);
    expect(inboxItemTarget({ path: "/bookinger" })).toBe("/bookinger");
    expect(inboxItemTarget({ path: `/anmeld/${BOOKING}` })).toBe(`/anmeld/${BOOKING}`);
    for (const bad of ["/klinik/kalender", "https://evil.example", `/anmeld/${BOOKING}?x=1`, "/login"]) {
      expect(inboxItemTarget({ path: bad })).toBe(NOTIFICATION_FALLBACK_PATH);
    }
  });

  it("markerer kun ulæste", () => {
    expect(needsMarking({ readAt: null })).toBe(true);
    expect(needsMarking({ readAt: "2026-11-05T10:00:00Z" })).toBe(false);
  });

  it("anmeldelsespåmindelsen peger på anmeldelsesskærmen og nævner ikke behandlingen", () => {
    const content = renderInboxContent("patient_review_reminder", { bookingId: BOOKING, startsAt: "2026-11-04T09:00:00Z" });
    expect(content).toEqual({ title: "Hvordan var dit besøg? Skriv gerne en anmeldelse.", body: null, path: `/anmeld/${BOOKING}` });
  });

  it("alle patient-typer kan renderes til en tilladt sti", () => {
    const payload = { caseId: CASE, leadId: LEAD, bookingId: BOOKING, startsAt: "2026-11-10T08:15:00Z", previousStartsAt: "2026-11-09T08:15:00Z" };
    for (const type of [
      "patient_lead_answered",
      "patient_new_message",
      "patient_booking_confirmed",
      "patient_booking_cancelled",
      "patient_booking_reminder",
      "patient_booking_created",
      "patient_booking_rescheduled",
      "patient_booking_cancelled_self",
      "patient_review_reminder",
    ] as const) {
      expect(inboxItemTarget(renderInboxContent(type, payload))).not.toBe(NOTIFICATION_FALLBACK_PATH);
    }
  });
});

describe("alder", () => {
  const now = new Date("2026-11-05T12:00:00Z");
  it("lige nu, minutter, timer og dato", () => {
    expect(formatNotificationAge("2026-11-05T11:59:40Z", now)).toBe("lige nu");
    expect(formatNotificationAge("2026-11-05T11:55:00Z", now)).toBe("5 min. siden");
    expect(formatNotificationAge("2026-11-05T09:00:00Z", now)).toBe("3 t. siden");
    expect(formatNotificationAge("2026-11-01T09:00:00Z", now)).toMatch(/1\. nov/);
  });
});
