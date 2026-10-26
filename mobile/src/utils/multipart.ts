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

// Et tekstfelt i formularen (fx beskedens tekst ved siden af billederne).
export type MultipartField = { field: string; value: string };

// Feltnavn uden tegn, der kan bryde headeren.
function safeName(name: string): string {
  return name.replace(/["\r\n]/g, "_");
}

// Bygger hele kroppen af tekstfelter og filer i den givne rækkefølge (fx en besked med op til 3 billeder, 10.12).
export function buildMultipartParts(parts: readonly (MultipartFile | MultipartField)[], boundary: string = createBoundary()): { body: Uint8Array; contentType: string } {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  for (const part of parts) {
    if ("bytes" in part) {
      chunks.push(
        encoder.encode(
          `--${boundary}\r\nContent-Disposition: form-data; name="${safeName(part.field)}"; filename="${safeFilename(part.filename)}"\r\nContent-Type: ${part.type}\r\n\r\n`,
        ),
        part.bytes,
        encoder.encode("\r\n"),
      );
    } else {
      chunks.push(encoder.encode(`--${boundary}\r\nContent-Disposition: form-data; name="${safeName(part.field)}"\r\n\r\n${part.value}\r\n`));
    }
  }
  chunks.push(encoder.encode(`--${boundary}--\r\n`));
  const body = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

export function buildMultipart(file: MultipartFile, boundary: string = createBoundary()): { body: Uint8Array; contentType: string } {
  return buildMultipartParts([file], boundary);
}
