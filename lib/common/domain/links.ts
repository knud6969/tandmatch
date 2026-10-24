// Sikre links til klinikkens website og telefon. Ren kode, delt af klinik-weben og patient-appen (architecture 2.1).
// Klinikkens website er indtastet af klinikken eller admin og må kun føre til http(s).

// Returnerer en gyldig http(s)-adresse eller null. Adresser uden skema (fx "www.klinik.dk") får https://.
export function safeWebsiteHref(raw: string | null | undefined): string | null {
  const text = raw?.trim();
  if (!text) return null;
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

// Kort visningstekst for et website (uden skema og efterfølgende skråstreg).
export function websiteLabel(href: string): string {
  return href.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

// tel:-link med kun cifre og plus.
export function phoneHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}
