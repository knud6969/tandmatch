-- Helligdage (2026-11-13, clinics 6.7): alle klinikker holder som udgangspunkt lukket på danske helligdage. En klinik kan
-- vælge at have åbent (clinics.open_on_holidays). Lukningen virker som en blokering hele dagen i lokal tid: den står i
-- public_busy_intervals(), så ledige tider springer dagen over, og assert_slot_bookable() afviser en tid på dagen.
--
-- Dagene (skal ændres sammen med lib/common/domain/holidays.ts): nytårsdag, skærtorsdag, langfredag, påskedag, 2. påskedag,
-- Kristi himmelfartsdag, pinsedag, 2. pinsedag, grundlovsdag, juleaftensdag, juledag, 2. juledag og nytårsaftensdag.
-- Store bededag er afskaffet fra 2024. Søndag er ikke en helligdag her: en søndag er lukket, når klinikken ikke har
-- åbningstider om søndagen (det er udgangspunktet for nye klinikker).

alter table public.clinics add column open_on_holidays boolean not null default false;
grant update (open_on_holidays) on public.clinics to authenticated;

-- Påskedag (gregoriansk, "anonymous Gregorian algorithm").
create function public.easter_sunday(p_year integer)
returns date
language plpgsql immutable set search_path = ''
as $$
declare
  a integer := p_year % 19;
  b integer := p_year / 100;
  c integer := p_year % 100;
  d integer := b / 4;
  e integer := b % 4;
  f integer := (b + 8) / 25;
  g integer := (b - f + 1) / 3;
  h integer := (19 * a + b - d - g + 15) % 30;
  i integer := c / 4;
  k integer := c % 4;
  l integer := (32 + 2 * e + 2 * i - h - k) % 7;
  m integer := (a + 11 * h + 22 * l) / 451;
  v_month integer := (h + l - 7 * m + 114) / 31;
  v_day integer := ((h + l - 7 * m + 114) % 31) + 1;
begin
  return make_date(p_year, v_month, v_day);
end;
$$;

-- Helligdagene i [p_from, p_to] (datoer).
create function public.danish_holidays(p_from date, p_to date)
returns table (day date)
language sql immutable set search_path = ''
as $$
  with years as (
    select generate_series(extract(year from p_from)::integer, extract(year from p_to)::integer) as y
  ), days as (
    select make_date(y, 1, 1) as day from years
    union all select public.easter_sunday(y) + o from years, unnest(array[-3, -2, 0, 1, 39, 49, 50]) as o
    union all select make_date(y, 6, 5) from years
    union all select make_date(y, 12, d) from years, unnest(array[24, 25, 26, 31]) as d
  )
  select day from days where day between p_from and p_to;
$$;

-- Optaget tid: bookinger, blokeringer og (for klinikker uden åbent på helligdage) hele helligdage i lokal tid.
create or replace function public.public_busy_intervals(p_clinic_ids uuid[], p_from timestamptz, p_to timestamptz)
returns table (clinic_id uuid, starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select b.clinic_id, b.starts_at, b.ends_at
    from public.bookings b
    join public.clinics k on k.id = b.clinic_id and k.status = 'verified'
   where b.clinic_id = any (p_clinic_ids)
     and b.ends_at > p_from and b.starts_at < p_to
     and public.effective_booking_status(b.status, b.ends_at, b.hold_expires_at) in ('held', 'booked', 'completed')
  union all
  select t.clinic_id, t.starts_at, t.ends_at
    from public.clinic_time_blocks t
    join public.clinics k on k.id = t.clinic_id and k.status = 'verified'
   where t.clinic_id = any (p_clinic_ids)
     and t.ends_at > p_from and t.starts_at < p_to
  union all
  select k.id, (h.day::timestamp at time zone 'Europe/Copenhagen'), ((h.day + 1)::timestamp at time zone 'Europe/Copenhagen')
    from public.clinics k
    cross join public.danish_holidays((p_from at time zone 'Europe/Copenhagen')::date, (p_to at time zone 'Europe/Copenhagen')::date) h
   where k.id = any (p_clinic_ids) and k.status = 'verified' and not k.open_on_holidays;
$$;

-- Som i 20261113000100, plus helligdage.
create or replace function public.assert_slot_bookable(
  p_clinic_id uuid, p_service_id uuid, p_starts_at timestamptz, p_ends_at timestamptz
)
returns void
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_emergency boolean;
  v_notice interval;
  v_local_start timestamp := p_starts_at at time zone 'Europe/Copenhagen';
  v_local_end timestamp := p_ends_at at time zone 'Europe/Copenhagen';
begin
  select (s.category = 'emergency') into v_emergency from public.services s where s.id = p_service_id and s.is_active;
  if v_emergency is null then
    raise exception 'INVALID_SERVICE' using errcode = '22023';
  end if;
  v_notice := case when v_emergency then interval '0 minutes' else interval '30 minutes' end;
  if extract(minute from v_local_start)::integer % 15 <> 0 or extract(second from v_local_start) <> 0 then
    raise exception 'SLOT_UNAVAILABLE' using errcode = 'P0001';
  end if;
  if p_starts_at < now() + v_notice or p_starts_at > now() + interval '60 days' then
    raise exception 'SLOT_UNAVAILABLE' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.clinic_opening_hours h
     where h.clinic_id = p_clinic_id
       and h.weekday = extract(isodow from v_local_start)::smallint
       and h.opens_at <= v_local_start::time
       and v_local_end::time <= h.closes_at
       and v_local_end::date = v_local_start::date
  ) then
    raise exception 'SLOT_UNAVAILABLE' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.clinic_time_blocks b
     where b.clinic_id = p_clinic_id and tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(p_starts_at, p_ends_at, '[)')
  ) then
    raise exception 'SLOT_UNAVAILABLE' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.clinics k where k.id = p_clinic_id and not k.open_on_holidays)
     and exists (select 1 from public.danish_holidays(v_local_start::date, v_local_start::date)) then
    raise exception 'SLOT_UNAVAILABLE' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.easter_sunday(integer) from public, anon, authenticated;
revoke all on function public.danish_holidays(date, date) from public, anon, authenticated;
revoke all on function public.assert_slot_bookable(uuid, uuid, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.public_busy_intervals(uuid[], timestamptz, timestamptz) from public;
grant execute on function public.public_busy_intervals(uuid[], timestamptz, timestamptz) to anon, authenticated, service_role;
