import type { AiChatMessageDto } from "@/lib/cases/types/ai";
import type { ChatImageItem } from "./chat-images";

// Beskeder og billeder i én tidslinje (architecture 7.9c): sorteret efter createdAt, stabilt ved ens tid.
export type TimelineEntry =
  | { kind: "message"; key: string; message: AiChatMessageDto }
  | { kind: "image"; key: string; item: ChatImageItem; index: number };

const timeOf = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : time;
};

// Med tid først (efter tid, så beskeder før billeder ved samme tid), derefter beskeder uden tid, og til sidst billeder uden tid
// (lokale uploads og billeder uden createdAt) i deres egen rækkefølge. `index` er billedets plads i billedlisten (til "Dit billede 2").
export function buildTimeline(messages: readonly AiChatMessageDto[], images: readonly ChatImageItem[]): TimelineEntry[] {
  const entries: { entry: TimelineEntry; time: number | null; order: number }[] = [
    ...messages.map((message, i) => ({ entry: { kind: "message", key: message.id, message } as TimelineEntry, time: timeOf(message.createdAt), order: i })),
    ...images.map((item, i) => ({ entry: { kind: "image", key: item.key, item, index: i } as TimelineEntry, time: timeOf(item.createdAt), order: messages.length + i })),
  ];
  const rank = (e: (typeof entries)[number]) => (e.time !== null ? 0 : e.entry.kind === "message" ? 1 : 2);
  return entries
    .sort((a, b) => rank(a) - rank(b) || (a.time !== null && b.time !== null && a.time !== b.time ? a.time - b.time : a.order - b.order))
    .map((e) => e.entry);
}
