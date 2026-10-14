import "server-only";
import { MAX_OPENING_HOUR_WINDOWS, MAX_TIME_BLOCKS_PER_CLINIC } from "@/lib/constants/clinics";
import type { NewOpeningHours, NewTimeBlock } from "@/lib/schemas/clinics";
import type { BusyInterval, OpeningHoursDto, TimeBlockDto, Weekday } from "@/lib/types/clinics";
import { ApiError } from "@/middleware/http";
import { BaseRepository } from "@/models/base/baseRepository";
import type { Tables } from "@/models/db/database.types";

type OpeningHoursRow = Pick<Tables<"clinic_opening_hours">, "weekday" | "opens_at" | "closes_at" | "is_emergency">;
type TimeBlockRow = Pick<Tables<"clinic_time_blocks">, "id" | "starts_at" | "ends_at" | "note">;

const HOURS_COLUMNS = "weekday, opens_at, closes_at, is_emergency";
const BLOCK_COLUMNS = "id, starts_at, ends_at, note";

// time-kolonner kommer som "HH:MM:SS"; API'et bruger "HH:MM".
const toHourMinute = (time: string) => time.slice(0, 5);

// Klinikkens åbningstider og blokeringer (architecture 4.3, 6.7). Med brugerens JWT: kun ejeren læser og skriver.
// `listBusyIntervals` er offentlig (public_busy_intervals) og giver optaget tid til ledige tider.
export class AvailabilityRepository extends BaseRepository {
  private hoursToDto(row: OpeningHoursRow): OpeningHoursDto {
    return {
      weekday: row.weekday as Weekday, // check 1-7 i databasen
      opensAt: toHourMinute(row.opens_at),
      closesAt: toHourMinute(row.closes_at),
      isEmergency: row.is_emergency,
    };
  }

  private blockToDto(row: TimeBlockRow): TimeBlockDto {
    return { id: row.id, startsAt: row.starts_at, endsAt: row.ends_at, note: row.note };
  }

  async listOpeningHours(clinicId: string): Promise<OpeningHoursDto[]> {
    const rows = await this.runList<OpeningHoursRow>(
      this.db
        .from("clinic_opening_hours")
        .select(HOURS_COLUMNS)
        .eq("clinic_id", clinicId)
        .order("weekday")
        .order("opens_at"),
      "clinic_opening_hours: list fejlede",
    );
    return rows.map((row) => this.hoursToDto(row));
  }

  // Erstatter hele listen i én transaktion (replace_opening_hours). Overlap afvises af triggeren og ruller alt tilbage,
  // så en fejl efterlader de gamle åbningstider uændret.
  async replaceOpeningHours(hours: NewOpeningHours[]): Promise<void> {
    await this.rpc("replace_opening_hours", { p_hours: hours }, {
      OPENING_HOURS_OVERLAP: new ApiError(400, "VALIDATION_ERROR", "Åbningstider på samme dag må ikke overlappe."),
      OPENING_HOURS_LIMIT: new ApiError(400, "VALIDATION_ERROR", `Du kan højst have ${MAX_OPENING_HOUR_WINDOWS} åbningstider.`),
    });
  }

  // Blokeringer, der overlapper intervallet (hver grænse er valgfri), sorteret efter start.
  async listTimeBlocks(clinicId: string, range: { from?: string; to?: string } = {}): Promise<TimeBlockDto[]> {
    let query = this.db.from("clinic_time_blocks").select(BLOCK_COLUMNS).eq("clinic_id", clinicId);
    if (range.from) query = query.gt("ends_at", range.from);
    if (range.to) query = query.lt("starts_at", range.to);
    const rows = await this.runList<TimeBlockRow>(query.order("starts_at"), "clinic_time_blocks: list fejlede");
    return rows.map((row) => this.blockToDto(row));
  }

  async createTimeBlock(clinicId: string, block: NewTimeBlock): Promise<TimeBlockDto> {
    const row = await this.run<TimeBlockRow>(
      this.db
        .from("clinic_time_blocks")
        .insert({ clinic_id: clinicId, starts_at: block.startsAt, ends_at: block.endsAt, note: block.note ?? null })
        .select(BLOCK_COLUMNS)
        .single(),
      "clinic_time_blocks: insert fejlede",
      {
        TIME_BLOCK_LIMIT: new ApiError(429, "TIME_BLOCK_LIMIT", `Du kan højst have ${MAX_TIME_BLOCKS_PER_CLINIC} blokerede tider.`),
      },
    );
    return this.blockToDto(this.requireRow(row));
  }

  // Sletter en blokering, der tilhører klinikken; 404 for alle andre (architecture 2.4).
  async deleteTimeBlock(clinicId: string, blockId: string): Promise<void> {
    const rows = await this.runList<Pick<TimeBlockRow, "id">>(
      this.db.from("clinic_time_blocks").delete().eq("clinic_id", clinicId).eq("id", blockId).select("id"),
      "clinic_time_blocks: delete fejlede",
    );
    this.requireRow(rows[0]);
  }

  // Optaget tid for verificerede klinikker i [from, to): ikke-udløbne `held`- og `booked`-bookinger samt blokeringer, kun
  // start og slut (ingen id'er, ingen typer, architecture 5.3). Grupperet pr. klinik.
  async listBusyIntervals(clinicIds: readonly string[], from: Date, to: Date): Promise<Map<string, BusyInterval[]>> {
    const result = new Map<string, BusyInterval[]>();
    if (clinicIds.length === 0) return result;
    const rows =
      (await this.rpc<{ clinic_id: string; starts_at: string; ends_at: string }[]>("public_busy_intervals", {
        p_clinic_ids: [...clinicIds],
        p_from: from.toISOString(),
        p_to: to.toISOString(),
      })) ?? [];
    for (const row of rows) {
      const list = result.get(row.clinic_id) ?? [];
      list.push({ startsAt: row.starts_at, endsAt: row.ends_at });
      result.set(row.clinic_id, list);
    }
    return result;
  }
}
