"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { NavItem } from "@/lib/common/navigation/areas";
import { cx } from "@/components/ui/cx";

// Områdets faner (architecture 6.3). På mobil ruller listen vandret: den aktive fane rulles ind i synsfeltet ved sideskift,
// og der vises en fade i den kant, hvor der er flere faner skjult. Fra xl skjules fade.
// `counts`: et lille tal på en fane (fx antal henvendelser, der kræver handling), med en skærmlæsertekst. 0 vises ikke.
export function AreaTabs({
  items,
  activeHref,
  counts,
}: {
  items: NavItem[];
  activeHref: string | undefined;
  counts?: Record<string, { value: number; label: string }>;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  const activeRef = useRef<HTMLAnchorElement>(null);
  const [fade, setFade] = useState({ left: false, right: false });

  const updateFade = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    setFade({ left: list.scrollLeft > 1, right: list.scrollLeft + list.clientWidth < list.scrollWidth - 1 });
  }, []);

  // Rul den aktive fane ind i synsfeltet. `nearest` rører ikke ved listen, hvis fanen allerede er helt synlig.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ inline: "nearest", block: "nearest" });
    // Første og sidste fane rulles helt til kanten, så listens indre luft ikke står som en skjult rest (og en falsk fade).
    const list = listRef.current;
    const li = activeRef.current?.parentElement;
    if (list && li) {
      if (!li.previousElementSibling) list.scrollLeft = 0;
      else if (!li.nextElementSibling) list.scrollLeft = list.scrollWidth;
    }
    updateFade();
  }, [activeHref, updateFade]);

  useEffect(() => {
    window.addEventListener("resize", updateFade);
    return () => window.removeEventListener("resize", updateFade);
  }, [updateFade]);

  return (
    <nav aria-label="Områdenavigation" className="relative border-t border-line">
      <ul ref={listRef} onScroll={updateFade} className="mx-auto flex max-w-wide gap-1 overflow-x-auto px-2 sm:px-4">
        {items.map((item) => {
          const active = item.href === activeHref;
          const count = counts?.[item.href];
          return (
            <li key={item.href}>
              <Link
                ref={active ? activeRef : undefined}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex min-h-12 items-center whitespace-nowrap border-b-[3px] px-3 text-base font-semibold no-underline",
                  active ? "border-brand-600 text-brand-800" : "border-transparent text-ink-muted hover:text-ink",
                )}
              >
                {item.label}
                {count && count.value > 0 && (
                  <span className="ml-1.5 inline-flex min-w-5 items-center justify-center rounded-pill bg-brand-600 px-1.5 text-xs font-bold text-on-brand" data-testid="fane-antal">
                    <span aria-hidden="true">{count.value}</span>
                    <span className="sr-only">, {count.label}</span>
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
      <span
        aria-hidden="true"
        data-testid="faner-fade-venstre"
        className={cx("pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-surface to-transparent xl:hidden", !fade.left && "hidden")}
      />
      <span
        aria-hidden="true"
        data-testid="faner-fade-hoejre"
        className={cx("pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-surface to-transparent xl:hidden", !fade.right && "hidden")}
      />
    </nav>
  );
}
