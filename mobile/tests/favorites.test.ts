import { NO_FAVORITES_TEXT } from "@/lib/clinics/constants/favorites";
import { toggleFavorite, favoriteLabel, withFavorite } from "~/utils/favorites";
import { RETURN_TO_PATTERNS, safeReturnTo } from "~/utils/return-to";

const calls = () => ({ add: jest.fn(async () => undefined), remove: jest.fn(async () => undefined) });

describe("hjertet: optimistisk skift (13.12)", () => {
  it("gemmer med det samme og kalder PUT", async () => {
    const api = calls();
    const seen: string[][] = [];
    const failure = await toggleFavorite(new Set(), "a", api, (next) => seen.push([...next]));
    expect(failure).toBeNull();
    expect(seen).toEqual([["a"]]);
    expect(api.add).toHaveBeenCalledWith("a");
    expect(api.remove).not.toHaveBeenCalled();
  });

  it("fjerner en gemt klinik med DELETE", async () => {
    const api = calls();
    const seen: string[][] = [];
    await toggleFavorite(new Set(["a", "b"]), "a", api, (next) => seen.push([...next]));
    expect(seen).toEqual([["b"]]);
    expect(api.remove).toHaveBeenCalledWith("a");
  });

  it("ruller tilbage, når kaldet fejler, og returnerer fejlen", async () => {
    const api = { add: jest.fn(async () => Promise.reject(new Error("nej"))), remove: jest.fn() };
    const seen: string[][] = [];
    const failure = await toggleFavorite(new Set(["b"]), "a", api, (next) => seen.push([...next].sort()));
    expect(seen).toEqual([["a", "b"], ["b"]]);
    expect(failure).toBeInstanceOf(Error);
  });

  it("withFavorite ændrer ikke det oprindelige sæt", () => {
    const ids = new Set(["a"]);
    expect([...withFavorite(ids, "b", true)].sort()).toEqual(["a", "b"]);
    expect([...ids]).toEqual(["a"]);
  });

  it("har tilgængelighedstekster og en tom-tekst", () => {
    expect(favoriteLabel(false)).toBe("Gem klinik");
    expect(favoriteLabel(true)).toBe("Fjern fra gemte");
    expect(NO_FAVORITES_TEXT).toBe("Du har ingen gemte klinikker endnu. Tryk på hjertet på en klinik for at gemme den.");
  });

  it("login kan sende patienten tilbage til Gemte klinikker", () => {
    expect(RETURN_TO_PATTERNS.length).toBeGreaterThan(0);
    expect(safeReturnTo("/favoritter")).toBe("/favoritter");
  });
});
