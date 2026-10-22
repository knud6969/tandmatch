// Ydelseskataloget som kontekst til AI'en og som validering af foreslåede slugs (architecture 7.2).
// Bygges af kataloget fra databasen ved hvert kald (features/cases/ai kender ikke databasen: kalderen
// henter ServiceGroupDto[]). Ingen priser og ingen klinikker. Ren fil uden server-imports.

import { SERVICE_CATEGORY_LABEL } from "@/lib/clinics/constants/services";
import type { ServiceGroupDto } from "@/lib/clinics/types/services";
import { escapeForPrompt } from "./promptFormat";

// Kataloget skrevet som data til prompten. Kategorien er kun en overskrift: AI'en foreslår behandlings-slugs.
export function buildCatalogContext(groups: ServiceGroupDto[]): string {
  const lines: string[] = [];
  for (const group of groups) {
    if (group.services.length === 0) continue;
    lines.push(`Kategori: ${escapeForPrompt(group.name)}`);
    for (const service of group.services) {
      lines.push(
        `- slug: ${service.slug} | navn: ${escapeForPrompt(service.name)} | type: ${SERVICE_CATEGORY_LABEL[service.category].toLowerCase()} | beskrivelse: ${escapeForPrompt(service.description)}`,
      );
    }
  }
  return `<service_catalog>\n${lines.join("\n")}\n</service_catalog>\nDette er kataloget. Foreslå kun slugs herfra.`;
}

export function catalogSlugs(groups: ServiceGroupDto[]): Set<string> {
  return new Set(groups.flatMap((group) => group.services.map((service) => service.slug)));
}
