import type { NextConfig } from "next";

// Sikkerhedsheadere for alle sider og API-svar (architecture 2.4).
//
// Supabase-projektets oprindelse (billeder fra public-media og signerede URL'er til case-images). Læses fra miljøet, så
// den lokale Supabase (http://127.0.0.1:54321) og det fælles projekt hver får sin egen politik.
function supabaseOrigin(): string | null {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

const isDev = process.env.NODE_ENV !== "production";

function contentSecurityPolicy(): string {
  const supabase = supabaseOrigin();
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // UNDTAGELSE: Next.js lægger inline-scripts til hydrering ind i siden. En nonce-baseret politik (proxy.ts, dynamisk
    // rendering af alle sider) er den strammere løsning, men kræver en omlægning af proxy og rendering. Indtil da tillades
    // 'unsafe-inline' for scripts; 'unsafe-eval' kun i udvikling (React bruger eval til fejlsporing, ikke i produktion).
    "script-src": ["'self'", "'unsafe-inline'", ...(isDev ? ["'unsafe-eval'"] : [])],
    // UNDTAGELSE: Tailwind/Next og React style-attributter kræver inline styles.
    "style-src": ["'self'", "'unsafe-inline'"],
    // Billeder: egne, data:/blob: (forhåndsvisning af valgte filer) og Supabase (public-media, signerede URL'er).
    // Ingen eksterne billedkilder ud over Supabase. Kortet (clinics 6.6) henter sine vektorfliser med fetch (connect-src).
    "img-src": ["'self'", "data:", "blob:", ...(supabase ? [supabase] : [])],
    "font-src": ["'self'"],
    // Browseren kalder kun egne /api-ruter (og i udvikling websocket til HMR på samme oprindelse) og OpenFreeMap (kortets
    // stil, vektorfliser, skrifttyper og ikoner, clinics 6.6). Supabase kaldes kun fra serveren, aldrig fra browseren.
    "connect-src": ["'self'", "https://tiles.openfreemap.org"],
    // MapLibre GL tegner kortet i web workers. Workerfilen ligger på egen oprindelse (setWorkerUrl i vector-base-layer.ts),
    // så blob: er ikke nødvendig (MapLibre bruger kun blob:-workers til en worker-URL på en anden oprindelse).
    "worker-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}

const nextConfig: NextConfig = {
  // Testene (tests/api/run.sh, tests/e2e/run.sh) bygger i deres egen mappe (.next-test). Deler en testserver cache med
  // `npm run dev`, der kører mod et andet miljø (.env.local), genbygger og genindlæser Next siden i ring (2026-10-26).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy() },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Ældre browsere, der ikke kender frame-ancestors.
          { key: "X-Frame-Options", value: "DENY" },
          // Ingen kamera eller mikrofon. Position kun på egen side, og kun når patienten selv trykker "Brug min position".
          ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
        ],
      },
    ];
  },
};

export default nextConfig;
