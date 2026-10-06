-- AI-lofter (architecture 7.6), håndhævet i databasen.
-- Lofterne ligger i tabellen ai_limits, så klienten ikke kan sende en egen cap til funktionerne.
-- Klienten kan kun øge tællere via funktionerne nedenfor, aldrig nulstille dem (ingen policies).

create table public.ai_limits (
  key text primary key check (char_length(key) between 1 and 60),
  value integer not null check (value > 0)
);

alter table public.ai_limits enable row level security;
-- Ingen policies: læses kun af security definer-funktioner.

insert into public.ai_limits (key, value) values
  ('anon_daily_ai_calls', 300),                       -- AI-kald fra alle anonyme sessioner samlet pr. døgn
  ('summary_generations_per_request', 5),             -- udkast pr. forespørgsel (patient med konto)
  ('summary_generations_per_request_anonymous', 3),   -- udkast pr. forespørgsel (anonym session)
  ('summary_generations_per_patient_day', 20);        -- udkast pr. patient pr. døgn

create or replace function public.ai_limit(p_key text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select l.value from public.ai_limits l where l.key = p_key;
$$;

-- Tæller for udkast pr. patient pr. døgn. Kun skrevet af consume_summary_generation().
create table public.ai_patient_usage_daily (
  patient_id uuid not null references public.patients (id) on delete cascade,
  day date not null,
  summary_generations integer not null default 0 check (summary_generations >= 0),
  primary key (patient_id, day)
);

alter table public.ai_patient_usage_daily enable row level security;
-- Ingen policies.

-- Erstatter den klient-styrede cap-version. Cap læses fra ai_limits.
-- Ny signatur uden parameter, og den gamle fjernes, så ingen kan kalde den med en valgt cap.
drop function if exists public.try_consume_anonymous_ai_call(integer);

create or replace function public.try_consume_anonymous_ai_call()
returns boolean
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_ok boolean;
  v_cap integer := public.ai_limit('anon_daily_ai_calls');
begin
  if v_cap is null then
    return false;
  end if;
  if not exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_anonymous) then
    return false;
  end if;

  insert into public.ai_usage_daily as u (day, anonymous_calls)
  values ((now() at time zone 'utc')::date, 1)
  on conflict (day) do update
    set anonymous_calls = u.anonymous_calls + 1
    where u.anonymous_calls < v_cap
  returning true into v_ok;

  return coalesce(v_ok, false);
end;
$fn$;

revoke all on function public.try_consume_anonymous_ai_call() from public, anon;
grant execute on function public.try_consume_anonymous_ai_call() to authenticated;

-- Tæller et udkast (opsummering) og returnerer hvor mange der er tilbage på forespørgslen.
-- Tjekker ejerskab, kladde-status, pr.-forespørgsel-loft (3 for anonyme, 5 ellers) og døgnloft (20).
-- Fejl rulles tilbage, fordi funktionen er ét statement.
create or replace function public.consume_summary_generation(p_request_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := (select auth.uid());
  v_req public.requests%rowtype;
  v_anonymous boolean;
  v_per_request integer;
  v_per_day integer := public.ai_limit('summary_generations_per_patient_day');
  v_day date := (now() at time zone 'utc')::date;
  v_ok boolean;
  v_count integer;
begin
  if v_uid is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;

  select * into v_req from public.requests
   where id = p_request_id and patient_id = v_uid
   for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_req.status <> 'draft' then
    raise exception 'NOT_DRAFT' using errcode = 'P0001';
  end if;

  select p.is_anonymous into v_anonymous from public.profiles p where p.id = v_uid;
  v_per_request := case
    when coalesce(v_anonymous, false) then public.ai_limit('summary_generations_per_request_anonymous')
    else public.ai_limit('summary_generations_per_request')
  end;

  if v_req.ai_generation_count >= v_per_request then
    raise exception 'SUMMARY_LIMIT' using errcode = 'P0001';
  end if;

  insert into public.ai_patient_usage_daily as u (patient_id, day, summary_generations)
  values (v_uid, v_day, 1)
  on conflict (patient_id, day) do update
    set summary_generations = u.summary_generations + 1
    where u.summary_generations < v_per_day
  returning true into v_ok;
  if v_ok is null then
    raise exception 'DAILY_SUMMARY_LIMIT' using errcode = 'P0001';
  end if;

  update public.requests
     set ai_generation_count = ai_generation_count + 1
   where id = p_request_id
  returning ai_generation_count into v_count;

  return v_per_request - v_count;
end;
$fn$;

revoke all on function public.consume_summary_generation(uuid) from public, anon;
grant execute on function public.consume_summary_generation(uuid) to authenticated;
