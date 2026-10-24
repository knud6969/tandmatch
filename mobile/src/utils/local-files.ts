import { File } from "expo-file-system";
import { buildMultipart } from "./multipart";
import { uploadFilePart } from "./chat-images";

// Billeder af munden er helbredsdata: de lokale filer (fra vælger/kamera og fra komprimering) slettes, når de ikke skal bruges mere.
// Sletningen må aldrig vælte flowet, så fejl ignoreres (filen kan allerede være væk).
export function deleteLocalFiles(uris: readonly (string | null | undefined)[]): void {
  for (const uri of new Set(uris)) {
    if (!uri) continue;
    try {
      const file = new File(uri);
      if (file.exists) file.delete();
    } catch {
      // Ignorer.
    }
  }
}

// Læser filen som bytes til upload.
export async function readLocalBytes(uri: string): Promise<Uint8Array> {
  return new File(uri).bytes();
}

// Læser den komprimerede fil og bygger multipart-kroppen til upload.
export async function multipartForImage(uri: string, index: number): Promise<{ body: Uint8Array; contentType: string }> {
  const part = uploadFilePart(uri, index);
  return buildMultipart({ field: "file", filename: part.name, type: part.type, bytes: await readLocalBytes(uri) });
}
