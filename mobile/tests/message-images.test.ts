import { File, Paths } from "expo-file-system";
import { saveTermsToken } from "~/auth/tokens";
import { sendMessageWithImages } from "~/api/messages";
import { multipartForMessage } from "~/utils/local-files";
import { buildMultipart, buildMultipartParts } from "~/utils/multipart";
import { canSendMessage, isEmptyMessage } from "@/lib/leads/domain/messages";

// Billeder i beskedtråden (features/leads/README.md 10.12): multipart med tekst og flere filer, og afsendelse via klienten.
// fetch og SecureStore er mocket; fil-modulet er jest-expos in-memory.
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

function localJpeg(name: string, bytes: number[]): string {
  const file = new File(Paths.cache, name);
  file.create({ overwrite: true });
  file.write(new Uint8Array(bytes));
  return file.uri;
}

describe("buildMultipartParts", () => {
  it("bygger tekstfelt og flere filer i rækkefølge med én afsluttende boundary", () => {
    const { body, contentType } = buildMultipartParts(
      [
        { field: "body", value: "Hej æøå" },
        { field: "file", filename: "a.jpg", type: "image/jpeg", bytes: new Uint8Array([1, 2]) },
        { field: "file", filename: "b.jpg", type: "image/jpeg", bytes: new Uint8Array([3]) },
      ],
      "B",
    );
    expect(contentType).toBe("multipart/form-data; boundary=B");
    const raw = Buffer.from(body).toString("utf8");
    expect(raw.startsWith('--B\r\nContent-Disposition: form-data; name="body"\r\n\r\nHej æøå\r\n')).toBe(true);
    expect(raw.split('name="file"')).toHaveLength(3);
    expect(raw.endsWith("\r\n--B--\r\n")).toBe(true);
    expect(raw.match(/--B--/g)).toHaveLength(1);
  });

  it("giver samme krop som buildMultipart for én fil", () => {
    const file = { field: "file", filename: "x.jpg", type: "image/jpeg", bytes: new Uint8Array([9, 8, 7]) };
    expect([...buildMultipartParts([file], "Z").body]).toEqual([...buildMultipart(file, "Z").body]);
  });
});

describe("multipartForMessage og sendMessageWithImages", () => {
  it("sender tekst og billeder som bytes-krop til trådens route", async () => {
    mockStore.clear();
    process.env.EXPO_PUBLIC_API_URL = "http://api.test";
    await saveTermsToken("terms-token");
    const uris = [localJpeg("m1.jpg", [1, 2, 3]), localJpeg("m2.jpg", [4, 5])];
    let seen: { url: string; init: RequestInit } | null = null;
    global.fetch = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
      seen = { url: String(url), init: init ?? {} };
      return new Response(JSON.stringify({ id: "m1", images: [] }), { status: 201, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;

    await sendMessageWithImages("lead-1", await multipartForMessage(uris, "  Se her  "));

    const { url, init } = seen as unknown as { url: string; init: RequestInit };
    expect(url).toBe("http://api.test/api/leads/lead-1/messages");
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(Uint8Array);
    const raw = text(init.body as Uint8Array);
    expect(raw).toContain('name="body"\r\n\r\nSe her\r\n');
    expect(raw).toContain('filename="billede-1.jpg"');
    expect(raw).toContain('filename="billede-2.jpg"');
    expect((init.headers as Record<string, string>)["Content-Type"]).toMatch(/^multipart\/form-data; boundary=/);
  });

  it("udelader tekstfeltet, når der kun er billeder", async () => {
    const { body } = await multipartForMessage([localJpeg("m3.jpg", [1])], "   ");
    expect(text(body)).not.toContain('name="body"');
  });
});

describe("beskedregler", () => {
  it("tekst eller billeder kræves; en tom besked uden billeder vises som slettet", () => {
    expect(canSendMessage("", 0)).toBe(false);
    expect(canSendMessage("", 2)).toBe(true);
    expect(isEmptyMessage({ body: "", images: [] })).toBe(true);
  });
});
