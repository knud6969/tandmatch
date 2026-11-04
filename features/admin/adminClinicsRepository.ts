import "server-only";
import { ADMIN_LIST_LIMIT } from "@/lib/admin/constants/admin";
import type { AdminClinicDto } from "@/lib/admin/types/admin";
import type { ClinicStatus } from "@/lib/clinics/types/clinics";
import { BaseRepository } from "@/platform/base/baseRepository";
import type { Tables } from "@/platform/db/database.types";
import { iso, isoOrNull } from "@/platform/db/mappers";
import { invalidStatusTransition, notFound } from "@/platform/middleware/http";

// Kun de kolonner, admin har brug for. owner_id bliver aldrig sendt videre, kun om der er en ejer.
type AdminClinicRow = Pick<Tables<"clinics">, "id" | "name" | "postal_code" | "city" | "cvr" | "status" | "owner_id" | "verified_at" | "created_at">;

const COLUMNS = "id, name, postal_code, city, cvr, status, owner_id, verified_at, created_at";

// Tegn, der har en betydning i PostgREST's or-filter eller i ilike, fjernes fra søgningen.
const searchTerm = (q: string) => q.replace(/[,()"'\\%_*]/g, " ").trim();

// Admins læsning og statusændring af klinikker (admin 5.3, 10.14). Brugerens JWT: admin har SELECT på clinics via
// is_admin(), og statusændringer sker kun gennem admin_change_clinic_status(), som selv tjekker rollen.
export class AdminClinicsRepository extends BaseRepository<AdminClinicRow, AdminClinicDto> {
  protected toDto(row: AdminClinicRow): AdminClinicDto {
    return {
      id: row.id,
      name: row.name,
      postalCode: row.postal_code,
      city: row.city,
      cvr: row.cvr,
      status: row.status,
      hasOwner: row.owner_id !== null,
      verifiedAt: isoOrNull(row.verified_at),
      createdAt: iso(row.created_at),
      canVerify: row.status === "registered",
      canPause: row.status === "verified",
    };
  }

  // Sorteret efter navn, højst 200 (ingen sidevisning, prototype).
  async list(filter: { status?: ClinicStatus; q?: string }): Promise<AdminClinicDto[]> {
    let query = this.db.from("clinics").select(COLUMNS).order("name").order("id").limit(ADMIN_LIST_LIMIT);
    if (filter.status) query = query.eq("status", filter.status);
    const term = searchTerm(filter.q ?? "");
    if (term) query = query.or(`name.ilike.%${term}%,city.ilike.%${term}%,cvr.ilike.%${term}%`);
    return this.toDtos(await this.runList<AdminClinicRow>(query, "clinics: select fejlede"));
  }

  async require(clinicId: string): Promise<AdminClinicDto> {
    const row = await this.run<AdminClinicRow>(this.db.from("clinics").select(COLUMNS).eq("id", clinicId).maybeSingle(), "clinics: select fejlede");
    return this.toDto(this.requireRow(row));
  }

  // "Verificér" og "Sæt på pause". 404 for ukendt klinik, 409 for en overgang, der ikke er tilladt.
  async changeStatus(clinicId: string, status: "verified" | "registered", reason: string | null): Promise<void> {
    await this.rpc(
      "admin_change_clinic_status",
      { p_clinic_id: clinicId, p_status: status, p_reason: reason },
      { NOT_FOUND: notFound(), INVALID_STATUS_TRANSITION: invalidStatusTransition() },
    );
  }
}
