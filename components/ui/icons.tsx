import type { ReactNode } from "react";

// Enkle linjeikoner (dekorative). Farven følger teksten, så temaet styrer den.
function Svg({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="28"
      height="28"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export const ICONS = {
  chat: (
    <Svg>
      <path d="M4 5h16v11H9l-5 4z" />
    </Svg>
  ),
  camera: (
    <Svg>
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </Svg>
  ),
  tooth: (
    <Svg>
      <path d="M7 4c-2 0-3.5 1.6-3.5 4 0 2 1 3.5 1.5 6 .5 2.5 1 6 2.5 6s1.5-4 3-4 1.5 4 3 4 2-3.5 2.5-6c.5-2.5 1.5-4 1.5-6 0-2.4-1.5-4-3.5-4-1.5 0-2 1-3.5 1S8.5 4 7 4z" />
    </Svg>
  ),
  clinic: (
    <Svg>
      <path d="M4 20V8l8-4 8 4v12z" />
      <path d="M12 10v6M9 13h6" />
    </Svg>
  ),
  star: (
    <Svg>
      <path d="M12 3.5l2.7 5.5 6 .9-4.4 4.2 1 6-5.3-2.8-5.3 2.8 1-6L3.3 9.9l6-.9z" />
    </Svg>
  ),
  calendar: (
    <Svg>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 10h16M9 3v4M15 3v4" />
    </Svg>
  ),
  tag: (
    <Svg>
      <path d="M3 12V4h8l10 10-8 8z" />
      <circle cx="7.5" cy="8.5" r="1.2" />
    </Svg>
  ),
  shield: (
    <Svg>
      <path d="M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6z" />
      <path d="M9 12l2 2 4-4" />
    </Svg>
  ),
  inbox: (
    <Svg>
      <path d="M4 13l2-8h12l2 8v6H4z" />
      <path d="M4 13h5l1 2h4l1-2h5" />
    </Svg>
  ),
  map: (
    <Svg>
      <path d="M12 21s7-6 7-11a7 7 0 10-14 0c0 5 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </Svg>
  ),
  alert: (
    <Svg>
      <path d="M12 4l9 16H3z" />
      <path d="M12 10v4M12 17v.5" />
    </Svg>
  ),
} as const;

export type IconName = keyof typeof ICONS;

// Farveflade med ikon. Bruges som neutral pladsholder for billeder (ingen rigtige personer eller eksterne URL'er).
export function IconTile({ name, tone = "light" }: { name: IconName; tone?: "light" | "solid" }) {
  return (
    <span
      className={
        tone === "solid"
          ? "inline-flex size-14 shrink-0 items-center justify-center rounded-card bg-brand-600 text-on-brand"
          : "inline-flex size-14 shrink-0 items-center justify-center rounded-card bg-brand-100 text-brand-700"
      }
    >
      {ICONS[name]}
    </span>
  );
}
