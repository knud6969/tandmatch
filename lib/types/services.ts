import type { SERVICE_CATEGORIES } from "@/lib/constants/services";

export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

export type ServiceDto = {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: ServiceCategory;
  defaultDurationMin: number;
};
