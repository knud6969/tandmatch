import "server-only";
import type { z } from "zod";
import type { NewClinicPrice, patchClinicSchema } from "@/lib/schemas/clinics";
import type { ClinicPriceDto, ClinicRecordDto, ClinicStatus } from "@/lib/types/clinics";
import { ApiError } from "@/middleware/http";
import { BaseRepository } from "@/models/base/baseRepository";
import type { Tables } from "@/models/db/database.types";
import { trustpilotFromColumns } from "@/models/db/mappers";

type ClinicPatch = z.infer<typeof patchClinicSchema>;

type ClinicRow = Omit<Tables<"clinics">, "owner_id" | "owner_since" | "created_at" | "import_source" | "verified_at">;

type PriceRow = Pick<Tables<"clinic_prices">, "service_id" | "price_min" | "price_max" | "duration_min" | "note"> & {
  services: Pick<Tables<"services">, "slug" | "name" | "sort_order"> | null;
};

const CLINIC_COLUMNS =
  "id, status, cvr, name, description, address, postal_code, city, lat, lng, phone, email, website, logo_path, logo_updated_at, " +
  "trustpilot_url, trustpilot_score, trustpilot_review_count, trustpilot_updated_at, trustpilot_entered_by, updated_at";

const PRICE_COLUMNS = "service_id, price_min, price_max, duration_min, note, services(slug, name, sort_order)";

// Klinikker og prislister (architecture 4.3 `clinics`, `clinic_prices`). Med brugerens JWT gælder RLS: klinikken ser
// og ændrer kun sig selv, og kun de felter, kolonne-grants tillader (5.1 regel 12). `setLogoPath` kræver
// service role-klienten (logo_path er ikke i kolonne-grants; 2.3 d). Prisliste og kategorier skrives af RPC'er (5.3).
export class ClinicsRepository extends BaseRepository<ClinicRow, ClinicRecordDto> {
  protected toDto(row: ClinicRow): ClinicRecordDto {
    return {
      id: row.id,
      status: row.status,
      cvr: row.cvr,
      name: row.name,
      description: row.description,
      address: row.address,
      postalCode: row.postal_code,
      city: row.city,
      location: row.lat !== null && row.lng !== null ? { lat: row.lat, lng: row.lng } : null,
      phone: row.phone,
      email: row.email,
      website: row.website,
      logoPath: row.logo_path,
      logoUpdatedAt: row.logo_updated_at,
      trustpilot: trustpilotFromColumns(row),
      updatedAt: row.updated_at,
    };
  }

  // Brugerens egen klinik, eller null. Filtrerer på ejer, så heller ikke en admin ser andres her.
  async findOwn(ownerId: string): Promise<ClinicRecordDto | null> {
    const row = await this.run<ClinicRow>(
      this.db.from("clinics").select(CLINIC_COLUMNS).eq("owner_id", ownerId).maybeSingle(),
      "clinics: select fejlede",
    );
    return row ? this.toDto(row) : null;
  }

  async requireOwn(ownerId: string): Promise<ClinicRecordDto> {
    return this.requireRow(await this.findOwn(ownerId));
  }

  // Ejertjek til controllerne (architecture 2.1.1): klinikkens id, eller 404 (også for en bruger uden klinik).
  async requireOwnId(ownerId: string): Promise<string> {
    const row = await this.run<Pick<Tables<"clinics">, "id">>(
      this.db.from("clinics").select("id").eq("owner_id", ownerId).maybeSingle(),
      "clinics: select fejlede",
    );
    return this.requireRow(row).id;
  }

  // Status på brugerens egen klinik (null, hvis brugeren ingen har). Til controllere, der kræver `verified` (architecture 5.7).
  async findOwnStatus(ownerId: string): Promise<ClinicStatus | null> {
    const row = await this.run<Pick<Tables<"clinics">, "status">>(
      this.db.from("clinics").select("status").eq("owner_id", ownerId).maybeSingle(),
      "clinics: select fejlede",
    );
    return row?.status ?? null;
  }

  // Forhåndstjek ved klinik-signup (architecture 4.3, 5.3): true, hvis en klinik med CVR'et allerede har en ejer.
  // GoTrue skjuler fejlen fra signup-triggeren, så controlleren svarer selv 409 CLINIC_EXISTS.
  async isCvrClaimed(cvr: string): Promise<boolean> {
    return (await this.rpc<boolean>("is_cvr_claimed", { p_cvr: cvr })) === true;
  }

  // Opdaterer de felter, der er sendt. Klinikken kan kun ændre kolonnerne i kolonne-grants; triggeren
  // clinics_guard() sætter placering ud fra postnummeret og trustpilot_entered_by = 'clinic'.
  async update(clinicId: string, patch: ClinicPatch): Promise<ClinicRecordDto> {
    const row = await this.patchRow(
      patch,
      {
        name: "name",
        description: "description",
        address: "address",
        postalCode: "postal_code",
        city: "city",
        phone: "phone",
        email: "email",
        website: "website",
        trustpilotUrl: "trustpilot_url",
        trustpilotScore: "trustpilot_score",
        trustpilotReviewCount: "trustpilot_review_count",
      },
      {
        update: (columns) => this.db.from("clinics").update(columns).eq("id", clinicId).select(CLINIC_COLUMNS).maybeSingle(),
        current: () => this.db.from("clinics").select(CLINIC_COLUMNS).eq("id", clinicId).maybeSingle(),
      },
      "clinics: update fejlede",
    );
    return this.toDto(row);
  }

  // Kun med service role-klienten (logo_path og logo_updated_at er ikke i kolonne-grants, architecture 5.1 regel 12;
  // 2.3 d). Sætter kun stien på en klinik, som brugeren stadig ejer (owner_id i selve opdateringen); 404 ellers, fx hvis
  // kontoen er slettet, mens filen blev behandlet. Versionen bruges som ?v= i logoets URL (9.5). Returnerer versionen.
  async setLogoPath(ownerId: string, clinicId: string, path: string | null): Promise<string> {
    const version = new Date().toISOString();
    const row = await this.run<Pick<ClinicRow, "id">>(
      this.db
        .from("clinics")
        .update({ logo_path: path, logo_updated_at: version })
        .eq("id", clinicId)
        .eq("owner_id", ownerId)
        .select("id")
        .maybeSingle(),
      "clinics: logo fejlede",
    );
    this.requireRow(row);
    return version;
  }

  // De valgte kategorier (kun ejeren kan læse dem, RLS).
  async listServiceGroupIds(clinicId: string): Promise<string[]> {
    const rows = await this.runList<Pick<Tables<"clinic_service_groups">, "group_id">>(
      this.db.from("clinic_service_groups").select("group_id").eq("clinic_id", clinicId),
      "clinic_service_groups: list fejlede",
    );
    return rows.map((row) => row.group_id);
  }

  // Erstatter de valgte kategorier i én transaktion; priser i fravalgte kategorier slettes (set_clinic_service_groups).
  async setServiceGroups(groupIds: string[]): Promise<string[]> {
    return (
      (await this.rpc<string[]>("set_clinic_service_groups", { p_group_ids: groupIds }, {
        UNKNOWN_SERVICE_GROUP: new ApiError(400, "UNKNOWN_SERVICE_GROUP", "En af kategorierne findes ikke i kataloget."),
      })) ?? []
    );
  }

  // Prislisten i katalogets rækkefølge.
  async listPrices(clinicId: string): Promise<ClinicPriceDto[]> {
    const rows = await this.runList<PriceRow>(
      this.db.from("clinic_prices").select(PRICE_COLUMNS).eq("clinic_id", clinicId),
      "clinic_prices: list fejlede",
    );
    return rows
      .filter((row): row is PriceRow & { services: NonNullable<PriceRow["services"]> } => row.services !== null)
      .sort((a, b) => a.services.sort_order - b.services.sort_order || a.services.name.localeCompare(b.services.name, "da"))
      .map((row) => ({
        serviceId: row.service_id,
        serviceSlug: row.services.slug,
        serviceName: row.services.name,
        price: { min: row.price_min, max: row.price_max },
        durationMin: row.duration_min,
        note: row.note,
      }));
  }

  // Erstatter hele prislisten i én transaktion (replace_clinic_prices): en fejl efterlader den gamle liste uændret.
  async replacePrices(prices: NewClinicPrice[]): Promise<void> {
    await this.rpc("replace_clinic_prices", { p_prices: prices }, {
      SERVICE_GROUP_NOT_SELECTED: new ApiError(409, "SERVICE_GROUP_NOT_SELECTED", "Vælg først kategorien, før du angiver priser i den."),
      UNKNOWN_SERVICE: new ApiError(400, "UNKNOWN_SERVICE", "En af behandlingerne findes ikke i kataloget."),
    });
  }
}
