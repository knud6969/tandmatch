-- Hjælpere til RLS-tests. Indlæses i hver testtransaktion (\ir) og forsvinder ved rollback.
-- KUN TIL LOKAL TEST mod `supabase start` + `supabase db reset`. Må aldrig køres mod et fælles projekt.
create schema tt;
grant usage on schema tt to public;

-- Deterministisk uuid ud fra et navn: tt.id('pA').
create function tt.id(p_name text) returns uuid language sql immutable as $$ select md5('tt:' || p_name)::uuid $$;

-- ---------------------------------------------------------------------------------------------------------
-- Rolleskift. set_config('role', ..., true) svarer til SET LOCAL ROLE og gælder resten af transaktionen.
-- ---------------------------------------------------------------------------------------------------------
create function tt.as_postgres() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

create function tt.as_user(p_uid uuid, p_anonymous boolean default false) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', p_uid, 'role', 'authenticated', 'aud', 'authenticated', 'is_anonymous', p_anonymous)::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

create function tt.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
end $$;

create function tt.as_service() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('role', 'service_role')::text, true);
  perform set_config('role', 'service_role', true);
end $$;

-- ---------------------------------------------------------------------------------------------------------
-- Assertions
-- ---------------------------------------------------------------------------------------------------------
create function tt.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_cond is not true then
    raise exception 'TEST FEJLET: %', p_msg using errcode = 'P9000';
  end if;
end $$;

create function tt.eq(p_actual anyelement, p_expected anyelement, p_msg text) returns void language plpgsql as $$
begin
  if p_actual is distinct from p_expected then
    raise exception 'TEST FEJLET: % (forventet %, faktisk %)', p_msg, p_expected, p_actual using errcode = 'P9000';
  end if;
end $$;

-- Kører en forespørgsel og returnerer første kolonne i første række som tekst (null ved ingen rækker).
create function tt.q(p_sql text) returns text language plpgsql as $$
declare v text;
begin
  execute p_sql into v;
  return v;
end $$;

-- Antal synlige rækker. "permission denied" (42501) tæller som 0 synlige.
create function tt.vis(p_sql text) returns integer language plpgsql as $$
declare n integer;
begin
  execute 'select count(*) from (' || p_sql || ') q' into n;
  return n;
exception when insufficient_privilege then
  return 0;
end $$;

-- Udsagnet skal give en fejl. p_expect (valgfri) matches mod sqlstate eller fejlteksten.
create function tt.denied(p_sql text, p_msg text, p_expect text default null) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if p_expect is not null and sqlstate <> p_expect and position(p_expect in sqlerrm) = 0 then
      raise exception 'TEST FEJLET: % (forventede fejl "%", fik % / %)', p_msg, p_expect, sqlstate, sqlerrm using errcode = 'P9000';
    end if;
    return;
  end;
  raise exception 'TEST FEJLET: % (udsagnet lykkedes, men skulle afvises)', p_msg using errcode = 'P9000';
end $$;

-- Udsagnet skal lykkes.
create function tt.allowed(p_sql text, p_msg text) returns void language plpgsql as $$
begin
  execute p_sql;
exception when others then
  raise exception 'TEST FEJLET: % (udsagnet blev afvist: % / %)', p_msg, sqlstate, sqlerrm using errcode = 'P9000';
end $$;

-- Udsagnet (update/delete) skal påvirke præcis p_rows rækker (0 = RLS filtrerer rækken væk).
create function tt.affects(p_sql text, p_rows integer, p_msg text) returns void language plpgsql as $$
declare n integer;
begin
  execute p_sql;
  get diagnostics n = row_count;
  if n <> p_rows then
    raise exception 'TEST FEJLET: % (forventede % påvirkede rækker, fik %)', p_msg, p_rows, n using errcode = 'P9000';
  end if;
exception when insufficient_privilege then
  if p_rows <> 0 then
    raise exception 'TEST FEJLET: % (permission denied: %)', p_msg, sqlerrm using errcode = 'P9000';
  end if;
end $$;

-- Antal rækker skal være p_rows (permission denied tæller som 0).
create function tt.rows(p_sql text, p_rows integer, p_msg text) returns void language plpgsql as $$
declare n integer := tt.vis(p_sql);
begin
  if n <> p_rows then
    raise exception 'TEST FEJLET: % (forventede % rækker, fik %)', p_msg, p_rows, n using errcode = 'P9000';
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------------------
-- Opslag (security definer, så de også virker efter rolleskift)
-- ---------------------------------------------------------------------------------------------------------
-- Klinik-id ud fra kort navn (tabellen fyldes i _fixtures.sql).
create table tt.clinic_names (name text primary key, cvr text not null);
grant select on tt.clinic_names to public;

create function tt.cid(p_name text) returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.clinics where cvr = (select cvr from tt.clinic_names where name = p_name)
$$;
create function tt.lead(p_case text, p_clinic text) returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.leads where case_id = tt.id(p_case) and clinic_id = tt.cid(p_clinic)
$$;
create function tt.booking(p_lead uuid) returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.bookings where lead_id = p_lead order by created_at desc limit 1
$$;
create function tt.consent(p_patient text, p_type public.consent_type) returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.consents where patient_id = tt.id(p_patient) and type = p_type order by created_at desc limit 1
$$;
create function tt.svc(p_slug text) returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.services where slug = p_slug
$$;
-- Tidspunkt i dansk lokaltid: p_days dage frem, klokken p_h:p_m:p_s.
create function tt.slot(p_days integer, p_h integer, p_m integer default 0, p_s integer default 0) returns timestamptz
language sql stable as $$
  select ((current_date + p_days) + make_time(p_h, p_m, p_s)) at time zone 'Europe/Copenhagen'
$$;
-- Er kolonnen med i funktionens returtabel?
create function tt.fn_returns_column(p_fn regprocedure, p_col text) returns boolean language sql stable security definer set search_path = '' as $$
  select p_col = any (coalesce((select array_agg(a) from unnest((select proargnames from pg_proc where oid = p_fn)) a), '{}'))
$$;
