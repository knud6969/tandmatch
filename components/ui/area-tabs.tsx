"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { NavItem } from "@/lib/common/navigation/areas";
import { cx } from "@/components/ui/cx";

// Områdets faner (architecture 6.3). På mobil ruller listen vandret: den aktive fane rulles ind i synsfeltet ved sideskift,
// og der vises en fade i den kant, hvor der er flere faner skjult. Fra xl har alle faner plads, og fade skjules.
export function AreaTabs({ items, activeHref }: { items: NavItem[]; activeHref: string | undefined }) {
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
