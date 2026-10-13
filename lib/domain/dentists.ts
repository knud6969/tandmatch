import type { DentistDto, DentistRecordDto, PortfolioItemDto } from "@/lib/types/clinics";

// Lægger hver tandlæges porteføljebilleder på tandlægen (architecture 10.8). Rækkefølgen i begge lister bevares.
export function attachPortfolio(dentists: readonly DentistRecordDto[], items: readonly PortfolioItemDto[]): DentistDto[] {
  return dentists.map((dentist) => ({
    ...dentist,
    portfolio: items.filter((item) => item.dentistId === dentist.id),
  }));
}
