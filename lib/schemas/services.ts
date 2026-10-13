import { z } from "zod";
import { SERVICE_CATEGORIES } from "@/lib/constants/services";

export const servicesQuerySchema = z
  .object({
    category: z.enum(SERVICE_CATEGORIES, { message: "Ukendt kategori." }).optional(),
  })
  .strict();
