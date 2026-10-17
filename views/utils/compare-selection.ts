// Patientens valgte klinikker pr. sag (architecture 6.1). Gemmes i sessionStorage, så valget består, når man går til en
// klinikprofil og tilbage. Det er kun klinikkens id og navn, aldrig helbredsdata.
export type CompareChoice = { id: string; name: string };

const key = (caseId: string) => `tandmatch:valgte-klinikker:${caseId}`;

export function readSelection(caseId: string): CompareChoice[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(window.sessionStorage.getItem(key(caseId)) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is CompareChoice =>
        typeof item === "object" && item !== null && typeof item.id === "string" && typeof item.name === "string",
    );
  } catch {
    return [];
  }
}

export function writeSelection(caseId: string, choices: CompareChoice[]): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key(caseId), JSON.stringify(choices));
  } catch {
    // Valget huskes bare ikke, hvis lagring er slået fra.
  }
}
