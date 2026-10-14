import "server-only";
import type { z } from "zod";
import { MAX_PORTFOLIO_ITEMS_PER_CLINIC } from "@/lib/constants/clinics";
import type { patchPortfolioItemSchema } from "@/lib/schemas/clinics";
import type { PortfolioItemDto } from "@/lib/types/clinics";
import { ApiError } from "@/middleware/http";
import { BaseRepository } from "@/models/base/baseRepository";
import type { Tables } from "@/models/db/database.types";
import { PublicMediaStorage } from "@/models/publicMediaStorage";

type PortfolioPatch = z.infer<typeof patchPortfolioItemSchema>;

type NewPortfolioItem = {
  id: string;
  clinicId: string;
  dentistId: string;
  serviceId: string | null;
  imagePath: string;
  caption: string | null;
  consentTextVersion: string;
};

type PortfolioRow = Pick<
  Tables<"portfolio_items">,
  "id" | "dentist_id" | "service_id" | "image_path" | "caption" | "patient_consent_confirmed_at"
> & { services: Pick<Tables<"services">, "name"> | null };

const PORTFOLIO_COLUMNS = "id, dentist_id, service_id, image_path, caption, patient_consent_confirmed_at, services(name)";

// Porteføljebilleder (architecture 4.3 `portfolio_items`, 9.5). Med brugerens JWT kan ejeren læse og ændre
// billedtekst og ydelse (kolonne-grants). `create` og `delete` kræver service role-klienten (2.3 d), fordi
// authenticated hverken kan indsætte eller slette; kalderen har tjekket ejerskab og samtykkebekræftelse først.
export class PortfolioRepository extends BaseRepository<PortfolioRow, PortfolioItemDto> {
  protected toDto(row: PortfolioRow): PortfolioItemDto {
    return {
      id: row.id,
      imageUrl: PublicMediaStorage.publicUrl(row.image_path),
      caption: row.caption,
      serviceId: row.service_id,
      serviceName: row.services?.name ?? null,
      dentistId: row.dentist_id,
      patientConsentConfirmedAt: row.patient_consent_confirmed_at,
    };
  }

  async listForClinic(clinicId: string): Promise<PortfolioItemDto[]> {
    return this.toDtos(
      await this.runList<PortfolioRow>(
        this.db.from("portfolio_items").select(PORTFOLIO_COLUMNS).eq("clinic_id", clinicId).order("created_at"),
        "portfolio_items: list fejlede",
      ),
    );
  }

  // Billedets sti til sletning af filen, hvis det tilhører klinikken; 404 ellers.
  async requireOwnPath(clinicId: string, itemId: string): Promise<string> {
    const row = await this.run<Pick<PortfolioRow, "image_path">>(
      this.db.from("portfolio_items").select("image_path").eq("clinic_id", clinicId).eq("id", itemId).maybeSingle(),
      "portfolio_items: select fejlede",
    );
    return this.requireRow(row).image_path;
  }

  // Alle billedstier for en tandlæge (til sletning af filerne, før tandlægen slettes).
  async listPathsForDentist(clinicId: string, dentistId: string): Promise<string[]> {
    const rows = await this.runList<Pick<PortfolioRow, "image_path">>(
      this.db.from("portfolio_items").select("image_path").eq("clinic_id", clinicId).eq("dentist_id", dentistId),
      "portfolio_items: list fejlede",
    );
    return rows.map((row) => row.image_path);
  }

  // Kun med service role-klienten. Samtykkebekræftelsen stemples her på serveren, aldrig af klienten.
  async create(item: NewPortfolioItem): Promise<PortfolioItemDto> {
    const row = await this.run<PortfolioRow>(
      this.db
        .from("portfolio_items")
        .insert({
          id: item.id,
          clinic_id: item.clinicId,
          dentist_id: item.dentistId,
          service_id: item.serviceId,
          image_path: item.imagePath,
          caption: item.caption,
          patient_consent_confirmed_at: new Date().toISOString(),
          consent_text_version: item.consentTextVersion,
        })
        .select(PORTFOLIO_COLUMNS)
        .single(),
      "portfolio_items: insert fejlede",
      {
        PORTFOLIO_LIMIT: new ApiError(
          429,
          "PORTFOLIO_LIMIT",
          `Du kan højst have ${MAX_PORTFOLIO_ITEMS_PER_CLINIC} porteføljebilleder.`,
        ),
      },
    );
    return this.toDto(this.requireRow(row));
  }

  async update(clinicId: string, itemId: string, patch: PortfolioPatch): Promise<PortfolioItemDto> {
    const row = await this.patchRow(
      patch,
      { caption: "caption", serviceId: "service_id" },
      {
        update: (columns) =>
          this.db
            .from("portfolio_items")
            .update(columns)
            .eq("clinic_id", clinicId)
            .eq("id", itemId)
            .select(PORTFOLIO_COLUMNS)
            .maybeSingle(),
        current: () =>
          this.db.from("portfolio_items").select(PORTFOLIO_COLUMNS).eq("clinic_id", clinicId).eq("id", itemId).maybeSingle(),
      },
      "portfolio_items: update fejlede",
    );
    return this.toDto(row);
  }

  // Kun med service role-klienten (2.3 d).
  async delete(clinicId: string, itemId: string): Promise<void> {
    await this.run(
      this.db.from("portfolio_items").delete().eq("clinic_id", clinicId).eq("id", itemId),
      "portfolio_items: delete fejlede",
    );
  }
}
