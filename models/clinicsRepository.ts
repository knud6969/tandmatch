import "server-only";
import type { z } from "zod";
import type { patchClinicSchema } from "@/lib/schemas/clinics";
import type { ClinicPriceDto, ClinicRecordDto } from "@/lib/types/clinics";
import { BaseRepository } from "@/models/base/baseRepository";
import type { Tables } from "@/models/db/database.types";

export type ClinicPatch = z.infer<typeof patchClinicSchema>;

export type NewClinicPrice = {
  serviceId: string;
  priceMin: number;
  priceMax: number;
  durationMin: number;
  note?: string | null;
};

type ClinicRow = Omit<Tables<"clinics">, "owner_id" | "owner_since" | "created_at" | "import_source" | "verified_at">;

type PriceRow = Pick<Tables<"clinic_prices">, "service_id" | "price_min" | "price_max" | "duration_min" | "note"> & {
  services: Pick<Tables<"services">, "slug" | "name" | "sort_order"> | null;
};

const CLINIC_COLUMNS =
  "id, status, cvr, name, description, address, postal_code, city, lat, lng, phone, email, website, logo_path, " +
  "trustpilot_url, trustpilot_score, trustpilot_review_count, trustpilot_updated_at, trustpilot_entered_by, updated_at";

const PRICE_COLUMNS = "service_id, price_min, price_max, duration_min, note, services(slug, name, sort_order)";

// Klinikker og prislister (architecture 4.3 `clinics`, `clinic_prices`). Med brugerens JWT gælder RLS: klinikken ser
// og ændrer kun sig selv, og kun de felter, kolonne-grants tillader (5.1 regel 12). `setLogoPath` og
// `findIdByOwner` kræver service role-klienten (logo_path er ikke i kolonne-grants; 2.3 d, f).
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
      trustpilot: row.trustpilot_url
        ? {
            url: row.trustpilot_url,
            score: row.trustpilot_score,
            reviewCount: row.trustpilot_review_count,
            updatedAt: row.trustpilot_updated_at,
            enteredBy: row.trustpilot_entered_by === "admin" ? "admin" : "clinic",
          }
        : null,
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

  // Opdaterer de felter, der er sendt. Klinikken kan kun ændre kolonnerne i kolonne-grants; triggeren
  // clinics_guard() sætter placering ud fra postnummeret og trustpilot_entered_by = 'clinic'.
  async update(clinicId: string, patch: ClinicPatch): Promise<ClinicRecordDto> {
    const columns = {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.address !== undefined ? { address: patch.address } : {}),
      ...(patch.postalCode !== undefined ? { postal_code: patch.postalCode } : {}),
      ...(patch.city !== undefined ? { city: patch.city } : {}),
      ...(patch.phone !== undefined ? { phone: patch.phone } : {}),
      ...(patch.email !== undefined ? { email: patch.email } : {}),
      ...(patch.website !== undefined ? { website: patch.website } : {}),
      ...(patch.trustpilotUrl !== undefined ? { trustpilot_url: patch.trustpilotUrl } : {}),
      ...(patch.trustpilotScore !== undefined ? { trustpilot_score: patch.trustpilotScore } : {}),
      ...(patch.trustpilotReviewCount !== undefined ? { trustpilot_review_count: patch.trustpilotReviewCount } : {}),
    };
    const row = await this.run<ClinicRow>(
      this.db.from("clinics").update(columns).eq("id", clinicId).select(CLINIC_COLUMNS).maybeSingle(),
      "clinics: update fejlede",
    );
    return this.toDto(this.requireRow(row));
  }

  // Kun med service role-klienten (logo_path er ikke i kolonne-grants, architecture 5.1 regel 12; 2.3 d).
  async setLogoPath(clinicId: string, path: string | null): Promise<void> {
    await this.run(this.db.from("clinics").update({ logo_path: path }).eq("id", clinicId), "clinics: logo fejlede");
  }

  // Klinikkens id ud fra ejeren. Bruges ved kontosletning med service role-klienten (2.3 f).
  async findIdByOwner(ownerId: string): Promise<string | null> {
    const row = await this.run<Pick<Tables<"clinics">, "id">>(
      this.db.from("clinics").select("id").eq("owner_id", ownerId).maybeSingle(),
      "clinics: select fejlede",
    );
    return row?.id ?? null;
  }

  // Kontosletning: fjerner beskrivelse, e-mail og hjemmeside (architecture 10.8), og Trustpilot-felterne hvis klinikken
  // selv har indtastet dem (admin-indtastet Trustpilot bevares). Ellers ville en senere ejer af samme CVR se den
  // slettede kontos e-mail. Idempotent, så sletningen kan gentages. Kun med service role-klienten.
  async clearClinicEnteredData(clinicId: string): Promise<void> {
    await this.run(
      this.db.from("clinics").update({ description: null, email: null, website: null }).eq("id", clinicId),
      "clinics: klinikdata fejlede",
    );
    await this.run(
      this.db
        .from("clinics")
        .update({ trustpilot_url: null, trustpilot_score: null, trustpilot_review_count: null, trustpilot_updated_at: null, trustpilot_entered_by: null })
        .eq("id", clinicId)
        .eq("trustpilot_entered_by", "clinic"),
      "clinics: trustpilot fejlede",
    );
  }

  // Kontosletning: hele prislisten. Kun med service role-klienten.
  async deleteAllPrices(clinicId: string): Promise<void> {
    await this.run(this.db.from("clinic_prices").delete().eq("clinic_id", clinicId), "clinic_prices: delete fejlede");
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

  // Erstatter hele prislisten: først gemmes de nye og ændrede rækker, derefter fjernes de, der ikke længere er med.
  // Rækkefølgen gør, at en fejl midtvejs aldrig efterlader en tom prisliste.
  async replacePrices(clinicId: string, prices: NewClinicPrice[]): Promise<void> {
    if (prices.length > 0) {
      await this.run(
        this.db.from("clinic_prices").upsert(
          prices.map((price) => ({
            clinic_id: clinicId,
            service_id: price.serviceId,
            price_min: price.priceMin,
            price_max: price.priceMax,
            duration_min: price.durationMin,
            note: price.note ?? null,
          })),
          { onConflict: "clinic_id,service_id" },
        ),
        "clinic_prices: upsert fejlede",
      );
    }
    let remove = this.db.from("clinic_prices").delete().eq("clinic_id", clinicId);
    if (prices.length > 0) {
      // Id'erne er validerede uuid'er (zod), så listen kan ikke indeholde andet.
      remove = remove.not("service_id", "in", `(${prices.map((price) => price.serviceId).join(",")})`);
    }
    await this.run(remove, "clinic_prices: delete fejlede");
  }
}
