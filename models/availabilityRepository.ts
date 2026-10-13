import "server-only";
import type { OpeningHoursDto, TimeBlockDto } from "@/lib/types/clinics";
import { BaseRepository } from "@/models/base/baseRepository";
import type { Tables } from "@/models/db/database.types";

type OpeningHoursRow = Pick<Tables<"clinic_opening_hours">, "weekday" | "opens_at" | "closes_at" | "is_emergency">;
type TimeBlockRow = Pick<Tables<"clinic_time_blocks">, "id" | "starts_at" | "ends_at" | "note">;

export type NewTimeBlock = { startsAt: string; endsAt: string; note?: string | null };

const HOURS_COLUMNS = "weekday, opens_at, closes_at, is_emergency";
const BLOCK_COLUMNS = "id, starts_at, ends_at, note";

// time-kolonner kommer som "HH:MM:SS"; API'et bruger "HH:MM".
const toHourMinute = (time: string) => time.slice(0, 5);

// Klinikkens åbningstider og blokeringer (architecture 4.3, 6.7). Med brugerens JWT: kun ejeren læser og skriver.
// Udvides i trin 2 med optaget tid til ledige tider.
export class AvailabilityRepository extends BaseRepository {
  private hoursToDto(row: OpeningHoursRow): OpeningHoursDto {
    return {
      weekday: row.weekday,
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

  // Erstatter hele listen. Triggeren afviser overlap mod eksisterende rækker, så de gamle fjernes først. Falder
  // indsættelsen, forsøges de gamle rækker genskabt, så klinikken ikke står uden åbningstider.
  async replaceOpeningHours(clinicId: string, hours: OpeningHoursDto[]): Promise<void> {
    const toRow = (hour: OpeningHoursDto) => ({
      clinic_id: clinicId,
      weekday: hour.weekday,
      opens_at: hour.opensAt,
      closes_at: hour.closesAt,
      is_emergency: hour.isEmergency,
    });
    const previous = await this.listOpeningHours(clinicId);
    await this.run(this.db.from("clinic_opening_hours").delete().eq("clinic_id", clinicId), "clinic_opening_hours: delete fejlede");
    if (hours.length === 0) return;
    try {
      await this.run(this.db.from("clinic_opening_hours").insert(hours.map(toRow)), "clinic_opening_hours: insert fejlede");
    } catch (err) {
      if (previous.length > 0) {
        await this.db.from("clinic_opening_hours").insert(previous.map(toRow));
      }
      throw err;
    }
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
}
