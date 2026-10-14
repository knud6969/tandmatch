import Link from "next/link";
import { CHAT_HREF, CHAT_READY } from "@/lib/navigation/entries";
import { Badge } from "@/views/components/ui/badge";
import { ICONS } from "@/views/components/ui/icons";

// Den fangende chat-indgang øverst på forsiden. Indtil chatten findes, er den en tydelig, ikke-klikbar "kommer snart".
export function ChatEntry() {
  const inner = (
    <>
      <span className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className="text-brand-700">{ICONS.chat}</span>
        <span className="flex min-w-0 flex-col">
          <span className="text-base font-semibold text-ink sm:text-lg">Beskriv dit problem eller upload et billede</span>
          <span className="text-sm text-ink-muted">AI hjælper dig med at sætte ord på det. Klinikken vurderer endeligt.</span>
        </span>
      </span>
      {CHAT_READY ? (
        <span className="shrink-0 rounded-pill bg-brand-600 px-5 py-3 text-base font-semibold text-on-brand">Start</span>
      ) : (
        <Badge tone="warning">Kommer snart</Badge>
      )}
    </>
  );
  const cls =
    "flex w-full flex-col items-start gap-3 rounded-card border border-line bg-surface p-4 shadow-raised sm:flex-row sm:items-center sm:rounded-pill sm:py-3 sm:pr-3 sm:pl-6";
  if (CHAT_READY) {
    return (
      <Link href={CHAT_HREF} className={`${cls} no-underline transition-shadow hover:shadow-card`}>
        {inner}
      </Link>
    );
  }
  return (
    <div className={cls} role="group" aria-label="Chat med AI-assistent, kommer snart">
      {inner}
    </div>
  );
}
