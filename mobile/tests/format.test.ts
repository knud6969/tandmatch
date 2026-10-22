import { formatClock, formatPercent, formatPriceRange, phoneHref, safeWebHref, websiteLabel } from "~/utils/format";

// Sikrer, at tal, tider og links vises på dansk, og at kun sikre links åbnes.
describe("format", () => {
  it("formaterer prisinterval på dansk", () => {
    expect(formatPriceRange(1200, 1800)).toBe("1.200–1.800 kr.");
    expect(formatPriceRange(500, 500)).toBe("500 kr.");
  });

  it("formaterer procent og klokkeslæt", () => {
    expect(formatPercent(84.6)).toBe("85 %");
    expect(formatClock("08:00:00")).toBe("08:00");
  });

  it("åbner kun http(s)-links", () => {
    expect(safeWebHref("www.klinik.dk")).toBe("https://www.klinik.dk/");
    expect(safeWebHref("javascript:alert(1)")).toBeNull();
    expect(safeWebHref("  ")).toBeNull();
    expect(websiteLabel("https://www.klinik.dk/")).toBe("www.klinik.dk");
  });

  it("bygger tel:-link", () => {
    expect(phoneHref("+45 12 34 56 78")).toBe("tel:+4512345678");
  });
});
