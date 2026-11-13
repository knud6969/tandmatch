// Danske helligdage (clinics 6.7), hvor klinikker som udgangspunkt holder lukket. Samme dage som public.danish_holidays() i
// migration 20261113000200 (skal ændres sammen). Databasen håndhæver lukningen; her bruges listen kun til visning.

export type Holiday = { date: string; name: string }; // date: "YYYY-MM-DD"

// Påskedag (gregoriansk, "anonymous Gregorian algorithm"), som public.easter_sunday().
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

const ymd = (date: Date) => date.toISOString().slice(0, 10);
const plusDays = (date: Date, days: number) => new Date(date.getTime() + days * 86_400_000);

// Årets helligdage i datoorden.
export function danishHolidays(year: number): Holiday[] {
  const easter = easterSunday(year);
  const fixed = (month: number, day: number) => new Date(Date.UTC(year, month - 1, day));
  const days: [Date, string][] = [
    [fixed(1, 1), "Nytårsdag"],
    [plusDays(easter, -3), "Skærtorsdag"],
    [plusDays(easter, -2), "Langfredag"],
    [easter, "Påskedag"],
    [plusDays(easter, 1), "2. påskedag"],
    [plusDays(easter, 39), "Kristi himmelfartsdag"],
    [plusDays(easter, 49), "Pinsedag"],
    [plusDays(easter, 50), "2. pinsedag"],
    [fixed(6, 5), "Grundlovsdag"],
    [fixed(12, 24), "Juleaftensdag"],
    [fixed(12, 25), "Juledag"],
    [fixed(12, 26), "2. juledag"],
    [fixed(12, 31), "Nytårsaftensdag"],
  ];
  return days.map(([date, name]) => ({ date: ymd(date), name })).sort((x, y) => x.date.localeCompare(y.date));
}

// De næste `count` helligdage fra og med `today` ("YYYY-MM-DD").
export function upcomingHolidays(today: string, count: number): Holiday[] {
  const year = Number(today.slice(0, 4));
  return [...danishHolidays(year), ...danishHolidays(year + 1)].filter((h) => h.date >= today).slice(0, count);
}
