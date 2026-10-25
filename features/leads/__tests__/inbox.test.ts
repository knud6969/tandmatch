import { describe, expect, it } from "vitest";
import { leadNeedsAction, summaryExcerpt } from "@/lib/leads/domain/leads";
import { LEAD_SUMMARY_EXCERPT_CHARS } from "@/lib/leads/constants/leads";
import { leadDeadlineText, leadFactLine } from "@/features/leads/components/lead-facts";
import type { ClinicLeadListItemDto } from "@/lib/leads/types/leads";

// Klinikkens indbakke (features/clinics/README.md 6.3, features/leads/README.md 10.9): "Kræver handling", uddrag og akut-frist.

const base: ClinicLeadListItemDto = {
  id: "l1",
  status: "sent",
  isEmergency: false,
  serviceNames: ["Blegning"],
  area: { postalCode: "2100", city: "København Ø" },
  distanceKm: 3.2,
  preferredTimeframe: null,
  requestedStartsAt: null,
  imageCount: 0,
  sentAt: "2026-10-24T08:00:00Z",
  seenAt: null,
  withdrawnAt: null,
  unreadMessages: 0,
  summaryExcerpt: "",
  listPrice: { min: 1200, max: 1800 },
  holdExpiresAt: null,
};

describe("leadNeedsAction", () => {
  it("er sand for et ubesvaret lead", () => {
    expect(leadNeedsAction({ status: "sent", unreadMessages: 0 })).toBe(true);
  });
  it("er sand for et besvaret lead med ulæste beskeder", () => {
    expect(leadNeedsAction({ status: "accepted", unreadMessages: 1 })).toBe(true);
    expect(leadNeedsAction({ status: "booked", unreadMessages: 2 })).toBe(true);
    expect(leadNeedsAction({ status: "declined", unreadMessages: 1 })).toBe(true);
  });
  it("er falsk for et besvaret lead uden ulæste og altid for et tilbagetrukket", () => {
    expect(leadNeedsAction({ status: "accepted", unreadMessages: 0 })).toBe(false);
    expect(leadNeedsAction({ status: "withdrawn", unreadMessages: 0 })).toBe(false);
    expect(leadNeedsAction({ status: "withdrawn", unreadMessages: 3 })).toBe(false);
  });
});

describe("summaryExcerpt", () => {
  it("giver kort tekst uændret og tom tekst for null", () => {
    expect(summaryExcerpt("Jeg vil gerne have lysere tænder.")).toBe("Jeg vil gerne have lysere tænder.");
    expect(summaryExcerpt(null)).toBe("");
  });
  it("samler mellemrum og linjeskift", () => {
    expect(summaryExcerpt("  Ondt\n\ni  kindtand  ")).toBe("Ondt i kindtand");
  });
  it("afkorter ved et ord til højst 120 tegn med …", () => {
    const long = "Jeg har haft ondt i en kindtand i nederste venstre side i flere uger, og det gør især ondt, når jeg drikker noget koldt eller tygger.";
    const result = summaryExcerpt(long);
    expect(result.length).toBeLessThanOrEqual(LEAD_SUMMARY_EXCERPT_CHARS);
    expect(result.endsWith("…")).toBe(true);
    expect(long.startsWith(result.slice(0, -1))).toBe(true);
    expect(result.slice(0, -1).endsWith(" ")).toBe(false);
  });
  it("skærer midt i et ord, hvis der ikke er et mellemrum i anden halvdel", () => {
    const result = summaryExcerpt("a".repeat(200));
    expect(result).toBe(`${"a".repeat(LEAD_SUMMARY_EXCERPT_CHARS - 1)}…`);
  });
  it("giver præcis 120 tegn uændret", () => {
    const exact = "b".repeat(LEAD_SUMMARY_EXCERPT_CHARS);
    expect(summaryExcerpt(exact)).toBe(exact);
  });
});

describe("indbakkens tekster", () => {
  it("viser akut-fristen som klokkeslæt i dansk tid", () => {
    expect(leadDeadlineText(null)).toBeNull();
    // 09:30 UTC er 11.30 dansk sommertid (oktober før skiftet).
    expect(leadDeadlineText("2026-10-24T09:30:00Z")).toBe("Svar inden kl. 11.30");
  });
  it("samler fakta på én linje med listepris og uden kontaktdata", () => {
    const line = leadFactLine(base);
    expect(line).toContain("2100 København Ø");
    expect(line).toContain("3,2 km");
    expect(line).toContain("Listepris 1.200–1.800 kr.");
    expect(line.split(" · ").length).toBe(3);
  });
});
