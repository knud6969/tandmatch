// Ren multipart/form-data-bygning til billedupload. RN's { uri, name, type }-dele understøttes ikke af expo/fetch
// (convertFormData.ts kaster "Unsupported FormDataPart implementation"), så kroppen bygges her som bytes.
// Bytes-kroppen har kendt længde, så serveren får Content-Length (den afviser chunked med 411).

export type MultipartFile = { field: string; filename: string; type: string; bytes: Uint8Array };

export function createBoundary(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let boundary = "----TandMatchBoundary";
  for (let i = 0; i < 16; i += 1) boundary += chars.charAt(Math.floor(Math.random() * chars.length));
  return boundary;
}

// Filnavn uden tegn, der kan bryde headeren.
function safeFilename(name: string): string {
  return name.replace(/["\r\n\\/]/g, "_");
}

export function buildMultipart(file: MultipartFile, boundary: string = createBoundary()): { body: Uint8Array; contentType: string } {
  const encoder = new TextEncoder();
  const head = encoder.encode(
    `--${boundary}\r\nContent-Disposition: form-data; name="${file.field}"; filename="${safeFilename(file.filename)}"\r\nContent-Type: ${file.type}\r\n\r\n`,
  );
  const tail = encoder.encode(`\r\n--${boundary}--\r\n`);
  const body = new Uint8Array(head.length + file.bytes.length + tail.length);
  body.set(head, 0);
  body.set(file.bytes, head.length);
  body.set(tail, head.length + file.bytes.length);
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}
