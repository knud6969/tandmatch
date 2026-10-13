import "server-only";
import type { ServiceCategory, ServiceDto } from "@/lib/types/services";
import { BaseRepository } from "@/models/base/baseRepository";
import type { Tables } from "@/models/db/database.types";

type ServiceRow = Pick<
  Tables<"services">,
  "id" | "slug" | "name" | "description" | "category" | "default_duration_min"
>;

const SERVICE_COLUMNS = "id, slug, name, description, category, default_duration_min";

// Ydelseskataloget (architecture 4.3). Kun aktive ydelser er synlige for andre end admin (RLS), og kun
// migration/admin skriver.
export class ServicesRepository extends BaseRepository<ServiceRow, ServiceDto> {
  protected toDto(row: ServiceRow): ServiceDto {
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      category: row.category,
      defaultDurationMin: row.default_duration_min,
    };
  }

  // Aktive ydelser i katalogets rækkefølge, evt. kun én kategori.
  async listActive(category?: ServiceCategory): Promise<ServiceDto[]> {
    let query = this.db.from("services").select(SERVICE_COLUMNS).eq("is_active", true);
    if (category) query = query.eq("category", category);
    return this.toDtos(
      await this.runList<ServiceRow>(query.order("sort_order").order("name"), "services: list fejlede"),
    );
  }
}
