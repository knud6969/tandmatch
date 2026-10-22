import type { SERVICE_CATEGORIES } from "@/lib/clinics/constants/services";

export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

export type ServiceDto = {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: ServiceCategory;
  defaultDurationMin: number;
  groupId: string;
  groupSlug: string;
};

// Katalogets kategori med dens aktive behandlinger (architecture 4.3, 10.4).
export type ServiceGroupDto = {
  id: string;
  slug: string;
  name: string;
  description: string;
  services: ServiceDto[];
};
