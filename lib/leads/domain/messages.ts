import { MESSAGE_IMAGE_URL_REUSE_MS } from "@/lib/leads/constants/messages";
import type { MessageDto } from "@/lib/leads/types/messages";

// Beskedtråden (features/leads/README.md 10.12): rene regler, som server, web og app deler.

// En besked kan sendes, når den har tekst eller mindst ét billede.
export const canSendMessage = (body: string, imageCount: number) => body.trim() !== "" || imageCount > 0;

// Beskeden har hverken tekst eller billeder (billederne er slettet, fx efter tilbagetrukket billedsamtykke).
export const isEmptyMessage = (message: Pick<MessageDto, "body" | "images">) => message.body === "" && message.images.length === 0;

// Signerede URL'er pr. billed-id og hvornår de blev hentet.
export type ImageUrlCache = ReadonlyMap<string, { url: string; at: number }>;

// Hver hentning giver nye signerede URL'er. For at billederne ikke hentes igen ved hver polling, genbruges den første URL for
// et billede, så længe den er yngre end `maxAgeMs` (under URL'ens levetid på 5 minutter). Returnerer beskederne med de
// genbrugte URL'er og den nye cache (kun billeder, der stadig findes).
export function keepImageUrls(
  cache: ImageUrlCache,
  messages: MessageDto[],
  now: number,
  maxAgeMs: number = MESSAGE_IMAGE_URL_REUSE_MS,
): { messages: MessageDto[]; cache: ImageUrlCache } {
  const next = new Map<string, { url: string; at: number }>();
  const result = messages.map((message) => {
    if (message.images.length === 0) return message;
    const images = message.images.map((image) => {
      const cached = cache.get(image.id);
      const entry = cached && now - cached.at < maxAgeMs ? cached : { url: image.url, at: now };
      next.set(image.id, entry);
      return entry.url === image.url ? image : { ...image, url: entry.url };
    });
    return { ...message, images };
  });
  return { messages: result, cache: next };
}
