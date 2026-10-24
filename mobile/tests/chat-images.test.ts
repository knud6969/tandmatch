import type { ImageDto } from "@/lib/common/types/common";
import { MAX_IMAGES_PER_CASE, MAX_IMAGE_UPLOAD_BYTES } from "@/lib/common/constants/limits";
import { bytesFromBase64, chatImageItems, qualityNotice, resizeFor, slotsLeft, uploadErrorText, uploadFilePart, UPLOAD_MAX_EDGE, withinSizeLimit } from "~/utils/chat-images";

// Sikrer, at billeder nedskaleres og begrænses efter serverens grænser, og at fejl og kvalitet vises på dansk.
describe("nedskalering", () => {
  it("rører ikke små billeder", () => {
    expect(resizeFor(1200, 900)).toBeNull();
    expect(resizeFor(UPLOAD_MAX_EDGE, UPLOAD_MAX_EDGE)).toBeNull();
  });
  it("skalerer den længste kant", () => {
    expect(resizeFor(4032, 3024)).toEqual({ width: UPLOAD_MAX_EDGE });
    expect(resizeFor(3024, 4032)).toEqual({ height: UPLOAD_MAX_EDGE });
  });
  it("ignorerer ugyldige mål", () => {
    expect(resizeFor(0, 100)).toBeNull();
  });
  it("holder sig under serverens dimension", () => {
    expect(UPLOAD_MAX_EDGE).toBeLessThanOrEqual(2048);
  });
});

describe("grænser", () => {
  it("tæller pladser tilbage pr. sag", () => {
    expect(slotsLeft(0)).toBe(MAX_IMAGES_PER_CASE);
    expect(slotsLeft(MAX_IMAGES_PER_CASE)).toBe(0);
    expect(slotsLeft(MAX_IMAGES_PER_CASE + 2)).toBe(0);
  });
  it("tjekker filstørrelsen", () => {
    expect(withinSizeLimit(MAX_IMAGE_UPLOAD_BYTES)).toBe(true);
    expect(withinSizeLimit(MAX_IMAGE_UPLOAD_BYTES + 1)).toBe(false);
    expect(withinSizeLimit(0)).toBe(false);
  });
  it("udleder størrelsen fra base64", () => {
    expect(bytesFromBase64("")).toBe(0);
    expect(bytesFromBase64("QUJD")).toBe(3);
    expect(bytesFromBase64("QUI=")).toBe(2);
    expect(bytesFromBase64("QQ==")).toBe(1);
  });
  it("giver filen et JPEG-navn", () => {
    expect(uploadFilePart("file:///a.jpg", 1)).toEqual({ uri: "file:///a.jpg", name: "billede-2.jpg", type: "image/jpeg" });
  });
});

describe("fejltekster", () => {
  it("kender grænsen for antal og størrelse", () => {
    expect(uploadErrorText({ code: "IMAGE_LIMIT" })).toContain(String(MAX_IMAGES_PER_CASE));
    expect(uploadErrorText({ code: "FILE_TOO_LARGE" })).toContain("for stort");
    expect(uploadErrorText({ code: "NETWORK" })).toContain("forbindelse");
  });
  it("falder tilbage til fejlens tekst eller en fast tekst", () => {
    expect(uploadErrorText(new Error("Noget gik galt"))).toBe("Noget gik galt");
    expect(uploadErrorText(null)).toBe("Billedet blev ikke sendt. Prøv igen.");
  });
});

describe("kvalitetsfeedback", () => {
  it("viser intet for ok eller ukendt", () => {
    expect(qualityNotice(null)).toBeNull();
    expect(qualityNotice("ok")).toBeNull();
    expect(qualityNotice("noget_nyt")).toBeNull();
  });
  it("forklarer problemet og gør nyt billede frivilligt", () => {
    const text = qualityNotice("too_dark");
    expect(text).toMatch(/mørkt/i);
    expect(text).toContain("valgfrit");
  });
});

describe("billedliste", () => {
  const server = { id: "a", url: "https://x/a", view: null, quality: "blurry", description: null } as ImageDto;
  it("samler serverens og lokale billeder, lokale sidst", () => {
    const items = chatImageItems([server], [{ key: "lokal-1", uri: "file:///b.jpg", status: "uploading", error: null }]);
    expect(items.map((i) => [i.key, i.status])).toEqual([["a", "uploaded"], ["lokal-1", "uploading"]]);
    expect(items[0].quality).toBe("blurry");
    expect(items[1].imageId).toBeNull();
  });
});
