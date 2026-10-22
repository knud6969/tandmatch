import {
  BOOKING_HORIZON_DAYS,
  CLINIC_TIME_ZONE,
  FIRST_AVAILABLE_SEARCH_DAYS,
  MAX_AVAILABILITY_RANGE_DAYS,
  MIN_BOOKING_NOTICE_MIN,
  MIN_EMERGENCY_NOTICE_MIN,
  SLOT_STEP_MINUTES,
} from "@/lib/constants/bookings";
import { DAY_MS } from "@/lib/common/domain/time";
import type { BusyInterval, OpeningHoursDto, SlotDto } from "@/lib/clinics/types/clinics";

// Ledige tider (architecture 6.7). Ren kode uden I/O: åbningstider og optaget tid kommer som indgangsdata fra
// repositories (public_clinics/public_clinic_profile og public_busy_intervals), og servicen kender hverken models eller
// Supabase. Reglerne spejler assert_slot_bookable() i databasen, som gentager tjekket ved booking, så beregningen her
// ikke er en sikkerhedsgrænse.

// Åbningsvinduer i lokal tid (Europe/Copenhagen). Samme form som OpeningHoursDto.
export type OpeningWindow = Pick<OpeningHoursDto, "weekday" | "opensAt" | "closesAt" | "isEmergency">;


export type SlotQuery = {
  openingHours: readonly OpeningWindow[];
  busy: readonly BusyInterval[];
  durationMin: number;
  isEmergency: boolean; // akutydelser må bruge både almindelige og akutte vinduer
  from: Date; // første mulige starttid (inklusiv)
  to: Date; // sidste mulige starttid (eksklusiv)
  limit?: number;
};

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

const zoneFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: CLINIC_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

type LocalTime = { dateKey: number; weekday: number; minutes: number; seconds: number };

export class AvailabilityService {
  // Forskydningen fra UTC pr. hel time. Sommertidsskift sker på hele timer, så en time har ét fast udsving.
  // Cachen lever kun så længe instansen (én request).
  private readonly offsets = new Map<number, number>();

  // `clock` gives i constructoren, så varsel og horisont kan testes.
  constructor(private readonly clock: () => Date = () => new Date()) {}

  // Tidsrummet, "første ledige tid" søges i: nu og FIRST_AVAILABLE_SEARCH_DAYS frem.
  searchRange(days = FIRST_AVAILABLE_SEARCH_DAYS): { from: Date; to: Date } {
    const from = this.clock();
    return { from, to: new Date(from.getTime() + days * DAY_MS) };
  }

  // Tidsrummet en forespørgsel dækker. Uden `from` bruges `defaultFrom` (standard: nu), uden `to` `defaultDays` frem fra
  // starten (standard: MAX_AVAILABILITY_RANGE_DAYS). Slutningen skal ligge efter starten, og tidsrummet er højst
  // `maxDays` langt (standard: MAX_AVAILABILITY_RANGE_DAYS). Ledige tider bruger standarderne; klinikkens kalender angiver sine
  // egne. Ren kode uden ApiError (servicen er uden I/O og middleware); controlleren gør en afvisning til 400.
  resolveRange(
    from?: string,
    to?: string,
    options: { defaultFrom?: Date; defaultDays?: number; maxDays?: number } = {},
  ): { ok: true; from: Date; to: Date } | { ok: false; message: string } {
    const { defaultFrom, defaultDays = MAX_AVAILABILITY_RANGE_DAYS, maxDays = MAX_AVAILABILITY_RANGE_DAYS } = options;
    const start = from ? new Date(from) : (defaultFrom ?? this.searchRange().from);
    const end = to ? new Date(to) : new Date(start.getTime() + defaultDays * DAY_MS);
    if (end.getTime() <= start.getTime()) return { ok: false, message: "Slutningen skal ligge efter starten." };
    if (end.getTime() - start.getTime() > maxDays * DAY_MS) {
      return { ok: false, message: `Du kan højst hente ${maxDays} dage ad gangen.` };
    }
    return { ok: true, from: start, to: end };
  }

  // Samlet varighed af behandlingerne hos en klinik: klinikkens egen (`durationMin`), ellers katalogets standard (som
  // service_duration_min() i databasen).
  durationFor(
    prices: readonly { serviceId: string; durationMin: number }[],
    services: readonly { id: string; defaultDurationMin: number }[],
  ): number {
    return services.reduce(
      (sum, service) => sum + (prices.find((price) => price.serviceId === service.id)?.durationMin ?? service.defaultDurationMin),
      0,
    );
  }

  // Tidligst mulige starttid: nu + varsel (almindelig 30 min, akut 0 min).
  earliestStart(isEmergency: boolean): Date {
    const notice = isEmergency ? MIN_EMERGENCY_NOTICE_MIN : MIN_BOOKING_NOTICE_MIN;
    return new Date(this.clock().getTime() + notice * MINUTE_MS);
  }

  // Senest mulige starttid: nu + horisont (inklusiv, som i databasen).
  latestStart(): Date {
    return new Date(this.clock().getTime() + BOOKING_HORIZON_DAYS * DAY_MS);
  }

  // Alle ledige starttider i [from, to), begrænset af varsel og horisont. Sorteret efter start.
  slots(query: SlotQuery): SlotDto[] {
    const result: SlotDto[] = [];
    if (!Number.isInteger(query.durationMin) || query.durationMin <= 0) return result;

    const windowsByDay = new Map<number, { opens: number; closes: number }[]>();
    for (const window of query.openingHours) {
      if (window.isEmergency && !query.isEmergency) continue; // almindelige ydelser kun i almindelige vinduer
      const list = windowsByDay.get(window.weekday) ?? [];
      list.push({ opens: toMinutes(window.opensAt), closes: toMinutes(window.closesAt) });
      windowsByDay.set(window.weekday, list);
    }
    if (windowsByDay.size === 0) return result;

    const busy = query.busy
      .map((interval) => ({ start: Date.parse(interval.startsAt), end: Date.parse(interval.endsAt) }))
      .filter((interval) => !Number.isNaN(interval.start) && !Number.isNaN(interval.end));

    const stepMs = SLOT_STEP_MINUTES * MINUTE_MS;
    const durationMs = query.durationMin * MINUTE_MS;
    const lowest = Math.max(query.from.getTime(), this.earliestStart(query.isEmergency).getTime());
    const toMs = query.to.getTime();
    const horizon = this.latestStart().getTime();
    const limit = query.limit ?? Number.POSITIVE_INFINITY;

    // Kvarterer i UTC falder på kvarterer i lokal tid, fordi tidszonens udsving er hele timer.
    for (let start = Math.ceil(lowest / stepMs) * stepMs; start < toMs && start <= horizon; start += stepMs) {
      const local = this.local(start);
      if (local.minutes % SLOT_STEP_MINUTES !== 0 || local.seconds !== 0) continue;
      const windows = windowsByDay.get(local.weekday);
      if (!windows) continue;
      const end = start + durationMs;
      const localEnd = this.local(end);
      if (localEnd.dateKey !== local.dateKey) continue; // vinduet slutter samme dag
      if (!windows.some((w) => w.opens <= local.minutes && localEnd.minutes <= w.closes)) continue;
      if (busy.some((b) => b.start < end && b.end > start)) continue;
      result.push({ startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString() });
      if (result.length >= limit) break;
    }
    return result;
  }

  // Første ledige tid i [from, to), eller null (oversigten viser så "Ingen ledige tider de næste 14 dage").
  firstSlot(query: Omit<SlotQuery, "limit">): SlotDto | null {
    return this.slots({ ...query, limit: 1 })[0] ?? null;
  }

  private offset(ms: number): number {
    const hour = Math.floor(ms / HOUR_MS);
    const cached = this.offsets.get(hour);
    if (cached !== undefined) return cached;
    const instant = hour * HOUR_MS;
    const parts: Record<string, number> = {};
    for (const part of zoneFormat.formatToParts(new Date(instant))) {
      if (part.type !== "literal") parts[part.type] = Number(part.value);
    }
    const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    const offset = asUtc - instant;
    this.offsets.set(hour, offset);
    return offset;
  }

  // Det lokale klokkeslæt i Europe/Copenhagen for et tidspunkt (ms siden epoch).
  private local(ms: number): LocalTime {
    const shifted = new Date(ms + this.offset(ms));
    const weekday = shifted.getUTCDay() === 0 ? 7 : shifted.getUTCDay(); // ISO: 1 = mandag … 7 = søndag
    return {
      dateKey: shifted.getUTCFullYear() * 10_000 + (shifted.getUTCMonth() + 1) * 100 + shifted.getUTCDate(),
      weekday,
      minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
      seconds: shifted.getUTCSeconds(),
    };
  }
}
