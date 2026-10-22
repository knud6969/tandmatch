import { apiRequest } from "@/platform/ui-utils/api-client";
import type { OwnClinicDto } from "@/lib/types/clinics";
import type { ServiceGroupDto } from "@/lib/types/services";

// Fælles hentning til klinikkens sider. Funktionerne er stabile, så de kan gives direkte til useLoad.
export const loadClinic = () => apiRequest<OwnClinicDto>("/api/clinics/me");

// Katalogets kategorier med deres behandlinger (architecture 10.4).
export const loadServiceGroups = async (): Promise<ServiceGroupDto[]> =>
  (await apiRequest<{ groups: ServiceGroupDto[] }>("/api/services")).groups;
