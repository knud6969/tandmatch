import { accountGate } from "~/utils/account-gate";
import { safeReturnTo } from "~/utils/return-to";

const ID = "123e4567-e89b-42d3-a456-426614174000";

describe("accountGate", () => {
  it("viser spinner, indhold, login-kort eller prøv igen pr. status", () => {
    expect(accountGate("loading")).toBe("spinner");
    expect(accountGate("account")).toBe("content");
    expect(accountGate("anonymous")).toBe("login");
    expect(accountGate("none")).toBe("login");
    expect(accountGate("unavailable")).toBe("retry");
  });
});

describe("safeReturnTo", () => {
  it("tillader de faste mønstre", () => {
    for (const path of ["/akut", "/bookinger", "/sager", `/sag/${ID}`, `/sag/${ID}/book/${ID}`, `/sag/${ID}/beskeder/${ID}`, `/anmeld/${ID}`]) {
      expect(safeReturnTo(path)).toBe(path);
    }
  });
  it("afviser fremmede og ukendte stier", () => {
    for (const path of ["https://evil.example", "//evil.example", "/konto", "/sag/abc", `/sag/${ID}/send`, `/sag/${ID}/../x`, `/sag/${ID}?x=1`, `/bookinger/`, "javascript:alert(1)", ""]) {
      expect(safeReturnTo(path)).toBeNull();
    }
    expect(safeReturnTo(undefined)).toBeNull();
    expect(safeReturnTo(["/akut"])).toBeNull();
  });
});
