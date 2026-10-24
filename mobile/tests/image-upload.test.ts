import { File, Paths } from "expo-file-system";
import { saveTermsToken } from "~/auth/tokens";
import { uploadCaseImage } from "~/api/images";
import { deleteLocalFiles, multipartForImage } from "~/utils/local-files";
import { buildMultipart } from "~/utils/multipart";

// Multipart-bygning, upload via klienten og oprydning af lokale billedfiler. fetch og SecureStore er mocket; fil-modulet er jest-expos in-memory.
const mockStore = new Map<string, string>();
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async (key: string) => mockStore.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockStore.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockStore.delete(key);
  }),
}));

const text = (bytes: Uint8Array) => Buffer.from(bytes).toString("latin1");

describe("buildMultipart", () => {
  it("bygger en gyldig krop med boundary, filnavn og type, og bevarer filens bytes", () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0x00, 0x0d, 0x0a, 0xff]);
    const { body, contentType } = buildMultipart({ field: "file", filename: 'bil"lede.jpg', type: "image/jpeg", bytes }, "BOUNDARY");
    expect(contentType).toBe("multipart/form-data; boundary=BOUNDARY");
    const head = '--BOUNDARY\r\nContent-Disposition: form-data; name="file"; filename="bil_lede.jpg"\r\nContent-Type: image/jpeg\r\n\r\n';
    const tail = "\r\n--BOUNDARY--\r\n";
    expect(text(body.slice(0, head.length))).toBe(head);
    expect([...body.slice(head.length, head.length + bytes.length)]).toEqual([...bytes]);
    expect(text(body.slice(head.length + bytes.length))).toBe(tail);
    expect(body.length).toBe(head.length + bytes.length + tail.length);
  });
});

describe("uploadCaseImage", () => {
  it("sender bytes-krop (kendt længde) med multipart-type og klientens headers", async () => {
    mockStore.clear();
    process.env.EXPO_PUBLIC_API_URL = "http://api.test";
    await saveTermsToken("terms-token");
    const file = new File(Paths.cache, "upload-test.jpg");
    file.create({ overwrite: true });
    file.write(new Uint8Array([1, 2, 3, 4]));
    let seen: { url: string; init: RequestInit } | null = null;
    global.fetch = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
      seen = { url: String(url), init: init ?? {} };
      return new Response(JSON.stringify({ id: "i1" }), { status: 201, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;

    await uploadCaseImage("case-1", await multipartForImage(file.uri, 0));

    expect(seen).not.toBeNull();
    const { url, init } = seen as unknown as { url: string; init: RequestInit };
    expect(url).toBe("http://api.test/api/cases/case-1/images");
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(Uint8Array);
    expect(text(init.body as Uint8Array)).toContain('filename="billede-1.jpg"');
    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toMatch(/^multipart\/form-data; boundary=/);
    expect(headers["Content-Type"]).not.toContain("undefined");
    expect(Object.values(headers)).toContain("terms-token");
  });
});

describe("deleteLocalFiles", () => {
  it("sletter eksisterende filer, ignorerer manglende og tomme", () => {
    const a = new File(Paths.cache, "a.jpg");
    const b = new File(Paths.cache, "b.jpg");
    a.create({ overwrite: true });
    b.create({ overwrite: true });
    expect(() => deleteLocalFiles([a.uri, a.uri, null, undefined, new File(Paths.cache, "findes-ikke.jpg").uri])).not.toThrow();
    expect(a.exists).toBe(false);
    expect(b.exists).toBe(true);
  });
});
