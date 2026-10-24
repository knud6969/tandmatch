import { MAX_IMAGES_PER_CASE, MAX_IMAGE_UPLOAD_BYTES } from "@/lib/common/constants/limits";
import { IMAGE_QUALITY_LABELS } from "@/lib/cases/constants/ai-texts";
import { IMAGE_QUALITIES } from "@/lib/cases/constants/ai";
import type { ImageQuality } from "@/lib/cases/types/ai";
import type { ImageDto } from "@/lib/common/types/common";
import { errorCodeOf } from "./chat-turn";

// Ren billedlogik til chatten uden React og uden netværk (architecture 9.3): størrelser, grænser, tekster og visning.

// Længste kant på telefonen. Under serverens loft (2048) og rigeligt til AI'ens 1024 px; holder filen langt under 4 MB.
export const UPLOAD_MAX_EDGE = 1600;
export const UPLOAD_JPEG_QUALITY = 0.7;

export const IMAGE_ADDED_NOTICE = "AI'en ser billedet, når du sender din næste besked. Billedet er ikke en vurdering; klinikken vurderer selv.";
export const IMAGE_UPLOAD_FAILED_TEXT = "Billedet blev ikke sendt. Prøv igen.";

// Resize-handlingen til expo-image-manipulator: kun hvis billedet er større end grænsen, og kun på den længste kant.
export function resizeFor(width: number, height: number, maxEdge: number = UPLOAD_MAX_EDGE): { width: number } | { height: number } | null {
  if (width <= 0 || height <= 0 || Math.max(width, height) <= maxEdge) return null;
  return width >= height ? { width: maxEdge } : { height: maxEdge };
}

export function slotsLeft(uploadedCount: number, max: number = MAX_IMAGES_PER_CASE): number {
  return Math.max(0, max - uploadedCount);
}

// Efter komprimering skal filen være under serverens loft; ellers sendes den ikke.
export function withinSizeLimit(bytes: number, max: number = MAX_IMAGE_UPLOAD_BYTES): boolean {
  return bytes > 0 && bytes <= max;
}

// Danske tekster for fejl fra upload; ukendte koder får den fælles tekst. Samtykke mangler tages af hooket, ikke vist som fejl.
export function uploadErrorText(error: unknown): string {
  switch (errorCodeOf(error)) {
    case "IMAGE_LIMIT":
      return `Du kan højst have ${MAX_IMAGES_PER_CASE} billeder pr. sag. Slet et billede for at tilføje et nyt.`;
    case "FILE_TOO_LARGE":
    case "PAYLOAD_TOO_LARGE":
      return "Billedet er for stort. Prøv et andet billede.";
    case "NETWORK":
      return "Ingen forbindelse. Tjek nettet, og prøv igen.";
    default:
      return error instanceof Error && error.message ? error.message : IMAGE_UPLOAD_FAILED_TEXT;
  }
}

// AI'ens kvalitetsfeedback ("billedet er for mørkt"); intet for "ok", ukendt eller manglende værdi.
export function qualityNotice(quality: string | null): string | null {
  if (!quality || quality === "ok") return null;
  if (!(IMAGE_QUALITIES as readonly string[]).includes(quality)) return null;
  return `${IMAGE_QUALITY_LABELS[quality as ImageQuality]}. Du kan tage et nyt billede, men det er ikke et krav.`;
}

// Et billede i chatten: enten gemt på serveren, eller lokalt under upload / fejlet. Lokale vises med telefonens egen fil.
export type ChatImageItem = {
  key: string;
  uri: string;
  status: "uploading" | "failed" | "uploaded";
  imageId: string | null;
  error: string | null;
  quality: string | null;
};

export type LocalImage = { key: string; uri: string; status: "uploading" | "failed"; error: string | null };

// Samler serverens billeder (signerede URL'er, nyeste kvalitet) og de lokale i én liste. Lokale kommer sidst.
export function chatImageItems(uploaded: readonly ImageDto[], local: readonly LocalImage[]): ChatImageItem[] {
  return [
    ...uploaded.map((image): ChatImageItem => ({ key: image.id, uri: image.url, status: "uploaded", imageId: image.id, error: null, quality: image.quality })),
    ...local.map((image): ChatImageItem => ({ ...image, imageId: null, quality: null })),
  ];
}

// Filnavn og MIME-type til multipart; billedet er altid JPEG efter komprimering.
export function uploadFilePart(uri: string, index: number): { uri: string; name: string; type: string } {
  return { uri, name: `billede-${index + 1}.jpg`, type: "image/jpeg" };
}

// Filens størrelse ud fra længden af dens base64-tekst (4 tegn = 3 bytes, minus polstring).
export function bytesFromBase64(base64: string): number {
  if (base64 === "") return 0;
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}
