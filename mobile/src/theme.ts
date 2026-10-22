// Farver, afstande og typografi på ét sted. Samme hvide og blå farver som weben (app/globals.css).
export const colors = {
  brand50: "#eff6ff",
  brand100: "#dbeafe",
  brand200: "#bfdbfe",
  brand600: "#2563eb",
  brand700: "#1d4ed8",
  brand800: "#1e40af",
  onBrand: "#ffffff",
  canvas: "#ffffff",
  surface: "#ffffff",
  surfaceMuted: "#f6f8fb",
  ink: "#162033",
  inkMuted: "#4a5568",
  line: "#e2e8f0",
  fieldBorder: "#718096",
  infoBg: "#eef4fc",
  infoLine: "#a5c3e8",
  warningBg: "#fff6e0",
  warningLine: "#e0b050",
  warningInk: "#5c3600",
  dangerBg: "#fdf1f0",
  dangerLine: "#d9776d",
  dangerInk: "#8a1c14",
  successBg: "#edf8f1",
  successLine: "#8fcaa6",
  successInk: "#155c33",
} as const;

// Afstande og hjørner i punkter (React Native bruger ikke rem).
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;
// Trykflader er mindst 44 x 44 pt (architecture 13.1).
export const MIN_TOUCH = 44;

// Skriftstørrelser; brødtekst er mindst 16 for læsbarhed på mobil.
export const fontSize = { xs: 12, sm: 14, md: 16, lg: 18, xl: 22, xxl: 28 } as const;

// Fælles typografi (13.9): rolig, med tydeligt hierarki. Skærme og komponenter bruger disse i stedet for egne størrelser.
export const type = {
  wordmark: { fontSize: fontSize.lg, fontWeight: "700", letterSpacing: -0.2, color: colors.brand700 },
  display: { fontSize: 30, lineHeight: 36, fontWeight: "700", letterSpacing: -0.5, color: colors.ink },
  screenTitle: { fontSize: fontSize.xxl, lineHeight: 34, fontWeight: "700", color: colors.ink },
  heading: { fontSize: fontSize.lg, lineHeight: 24, fontWeight: "700", color: colors.ink },
  title: { fontSize: fontSize.lg, lineHeight: 24, fontWeight: "600", color: colors.ink },
  body: { fontSize: fontSize.md, lineHeight: 24, fontWeight: "400", color: colors.inkMuted },
  label: { fontSize: fontSize.md, lineHeight: 22, fontWeight: "600", color: colors.ink },
  caption: { fontSize: fontSize.sm, lineHeight: 20, fontWeight: "400", color: colors.inkMuted },
  eyebrow: { fontSize: fontSize.xs, lineHeight: 16, fontWeight: "600", letterSpacing: 0.6, color: colors.inkMuted },
} as const;

// Størrelser til ikoner og runde knapper.
export const iconSize = { sm: 18, md: 22 } as const;
export const SEND_BUTTON = 44;
