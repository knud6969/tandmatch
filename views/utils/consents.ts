import type { ConsentDto } from "@/lib/types/consents";
import { apiRequest } from "@/views/utils/api-client";

// Patientens samtykker (architecture 4.3, 10.3). Stabil funktion, så den kan gives direkte til useLoad.
export const loadConsents = async (): Promise<ConsentDto[]> => (await apiRequest<{ consents: ConsentDto[] }>("/api/consents")).consents;
