import { parseContactForm } from "~/utils/notification-inbox";

describe("e-mail og telefon til notifikationer (13.10, identity 10.20)", () => {
  it("tomme felter bliver null og rydder valget", () => {
    expect(parseContactForm({ email: "  ", phone: "" })).toEqual({ ok: true, data: { email: null, phone: null } });
  });

  it("gyldige værdier trimmes", () => {
    expect(parseContactForm({ email: " lea@example.com ", phone: " +45 12 34 56 78 " })).toEqual({
      ok: true,
      data: { email: "lea@example.com", phone: "+45 12 34 56 78" },
    });
  });

  it("kan angive kun den ene kanal", () => {
    expect(parseContactForm({ email: "", phone: "12 34 56 78" })).toEqual({ ok: true, data: { email: null, phone: "12 34 56 78" } });
    expect(parseContactForm({ email: "lea@example.com", phone: "" })).toEqual({ ok: true, data: { email: "lea@example.com", phone: null } });
  });

  it("afviser ugyldig e-mail og for kort telefonnummer med fejl ved felterne", () => {
    const result = parseContactForm({ email: "ikke-en-mail", phone: "123" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.email).toBe("Angiv en gyldig e-mailadresse.");
      expect(result.errors.phone).toBe("Angiv et gyldigt telefonnummer.");
    }
  });
});
