import type { ServiceGroupDto } from "@/lib/clinics/types/services";
import { apiRequest } from "./client";

// Kataloget: aktive kategorier med behandlinger (architecture 10.4).
export async function getServiceGroups(): Promise<ServiceGroupDto[]> {
  const result = await apiRequest<{ groups: ServiceGroupDto[] }>("/api/services");
  return result.groups;
}
