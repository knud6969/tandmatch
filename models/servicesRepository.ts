import "server-only";
import type { ServiceCategory, ServiceDto, ServiceGroupDto } from "@/lib/types/services";
import { ApiError } from "@/middleware/http";
import { BaseRepository } from "@/models/base/baseRepository";
import type { Tables } from "@/models/db/database.types";

type GroupRow = Pick<Tables<"service_groups">, "id" | "slug" | "name" | "description" | "sort_order" | "is_active">;
type ServiceRow = Pick<
  Tables<"services">,
  "id" | "slug" | "name" | "description" | "category" | "default_duration_min" | "sort_order" | "group_id"
> & { service_groups: GroupRow | null };

const SERVICE_COLUMNS =
  "id, slug, name, description, category, default_duration_min, sort_order, group_id, " +
  "service_groups!inner(id, slug, name, description, sort_order, is_active)";

// Ydelseskataloget i to niveauer (architecture 4.3). Kun aktive behandlinger i aktive kategorier er synlige for andre end
// admin, og kun migration/admin skriver. Katalogopslag samles her (`requireActive`), så ingen controller har sin egen kopi.
export class ServicesRepository extends BaseRepository<ServiceRow, ServiceDto> {
  protected toDto(row: ServiceRow): ServiceDto {
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      category: row.category,
      defaultDurationMin: row.default_duration_min,
      groupId: row.group_id,
      groupSlug: row.service_groups?.slug ?? "",
    };
  }

  // Aktive behandlinger i aktive kategorier, sorteret efter kategori og behandling; evt. kun én overordnet type.
  private async listActiveRows(category?: ServiceCategory, ids?: readonly string[]): Promise<ServiceRow[]> {
    let query = this.db.from("services").select(SERVICE_COLUMNS).eq("is_active", true).eq("service_groups.is_active", true);
    if (category) query = query.eq("category", category);
    if (ids) query = query.in("id", [...ids]);
    const rows = await this.runList<ServiceRow>(query, "services: list fejlede");
    return rows
      .filter((row) => row.service_groups !== null)
      .sort(
        (a, b) =>
          (a.service_groups?.sort_order ?? 0) - (b.service_groups?.sort_order ?? 0) ||
          a.sort_order - b.sort_order ||
          a.name.localeCompare(b.name, "da"),
      );
  }

  // Den eneste hentning af kataloget (10.4): aktive kategorier med deres aktive behandlinger. Kategorier uden behandlinger
  // (efter filteret) udelades.
  async listGroups(category?: ServiceCategory): Promise<ServiceGroupDto[]> {
    const groups = new Map<string, ServiceGroupDto>();
    for (const row of await this.listActiveRows(category)) {
      const group = row.service_groups;
      if (!group) continue;
      const entry = groups.get(group.id) ?? {
        id: group.id,
        slug: group.slug,
        name: group.name,
        description: group.description,
        services: [],
      };
      entry.services.push(this.toDto(row));
      groups.set(group.id, entry);
    }
    return [...groups.values()];
  }

  // Kaster 400 UNKNOWN_SERVICE, hvis en af behandlingerne ikke findes eller ikke er aktiv. Returnerer de fundne.
  async requireActive(ids: readonly string[]): Promise<ServiceDto[]> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return [];
    const found = this.toDtos(await this.listActiveRows(undefined, unique));
    if (found.length !== unique.length) {
      throw new ApiError(400, "UNKNOWN_SERVICE", "En af behandlingerne findes ikke i kataloget.");
    }
    return found;
  }
}
