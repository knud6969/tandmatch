-- 1.9.1 del 2: klinikkens valgte kategorier, prisreglen i databasen, atomare udskiftninger og logoets version
-- (architecture 4.3 clinic_service_groups, 5.3, 9.5).

-- Klinikkens valgte kategorier. Ingen direkte skrivning; kun set_clinic_service_groups() skriver.
create table public.clinic_service_groups (
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  group_id uuid not null references public.service_groups (id),
  created_at timestamptz not null default now(),
  primary key (clinic_id, group_id)
);

alter table public.clinic_service_groups enable row level security;
create policy clinic_service_groups_select_owner on public.clinic_service_groups
  for select to authenticated using (public.is_clinic_owner(clinic_id));
revoke insert, update, delete, truncate on public.clinic_service_groups from authenticated;
revoke all on public.clinic_service_groups from anon;

-- Logoets version til cache-busting (?v=...). Sættes af applikationen (service role), når logoet lægges ind eller fjernes.
alter table public.clinics add column logo_updated_at timestamptz null;
update public.clinics set logo_updated_at = updated_at where logo_path is not null;

-- En pris kræver en aktiv behandling i en aktiv kategori, som klinikken har valgt. Gælder alle skrivere.
create function public.clinic_prices_guard()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_group uuid;
  v_active boolean;
begin
  select s.group_id, s.is_active and g.is_active into v_group, v_active
    from public.services s join public.service_groups g on g.id = s.group_id
   where s.id = new.service_id;
  if not found or not v_active then
    raise exception 'UNKNOWN_SERVICE' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.clinic_service_groups c where c.clinic_id = new.clinic_id and c.group_id = v_group
  ) then
    raise exception 'SERVICE_GROUP_NOT_SELECTED' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.clinic_prices_guard() from public, anon, authenticated;

create trigger clinic_prices_guard
  before insert or update of service_id on public.clinic_prices
  for each row execute function public.clinic_prices_guard();

-- Fælles ejertjek for de tre RPC'er: kun en permanent klinikejer. Returnerer klinikkens id.
create function public.require_clinic_editor()
returns uuid
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_clinic uuid;
begin
  if v_uid is null or not public.is_permanent_user() then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;
  select c.id into v_clinic from public.clinics c where c.owner_id = v_uid;
  if v_clinic is null then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  return v_clinic;
end;
$$;
revoke all on function public.require_clinic_editor() from public, anon, authenticated;

-- Erstatter klinikkens valgte kategorier i én transaktion; priser i fravalgte kategorier slettes.
create function public.set_clinic_service_groups(p_group_ids uuid[])
returns uuid[]
language plpgsql security definer set search_path = ''
as $$
declare
  v_clinic uuid := public.require_clinic_editor();
  v_ids uuid[];
begin
  select coalesce(array_agg(distinct g), '{}') into v_ids from unnest(coalesce(p_group_ids, '{}')) g;
  if cardinality(v_ids) > 100 then
    raise exception 'INVALID_INPUT' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(v_ids) g where not exists (select 1 from public.service_groups sg where sg.id = g and sg.is_active)
  ) then
    raise exception 'UNKNOWN_SERVICE_GROUP' using errcode = 'P0001';
  end if;

  delete from public.clinic_prices cp
   using public.services s
   where cp.clinic_id = v_clinic and s.id = cp.service_id and not (s.group_id = any (v_ids));
  delete from public.clinic_service_groups where clinic_id = v_clinic and not (group_id = any (v_ids));
  insert into public.clinic_service_groups (clinic_id, group_id)
  select v_clinic, g from unnest(v_ids) g
  on conflict do nothing;

  return (select coalesce(array_agg(g.group_id order by sg.sort_order, sg.name), '{}')
            from public.clinic_service_groups g join public.service_groups sg on sg.id = g.group_id
           where g.clinic_id = v_clinic);
end;
$$;

-- Erstatter hele prislisten i én transaktion: [{ serviceId, priceMin, priceMax, durationMin, note }].
create function public.replace_clinic_prices(p_prices jsonb)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_clinic uuid := public.require_clinic_editor();
  v_count integer;
begin
  if p_prices is null or jsonb_typeof(p_prices) <> 'array' or jsonb_array_length(p_prices) > 100 then
    raise exception 'INVALID_INPUT' using errcode = '22023';
  end if;
  if exists (
    select 1
      from jsonb_to_recordset(p_prices)
        as x ("serviceId" uuid, "priceMin" integer, "priceMax" integer, "durationMin" smallint, note text)
     where "serviceId" is null or "priceMin" is null or "priceMax" is null or "durationMin" is null
        or "priceMin" < 0 or "priceMax" < "priceMin" or "priceMax" > 1000000
  ) or (
    select count(distinct x."serviceId") <> count(*)
      from jsonb_to_recordset(p_prices) as x ("serviceId" uuid)
  ) then
    raise exception 'INVALID_INPUT' using errcode = '22023';
  end if;

  delete from public.clinic_prices where clinic_id = v_clinic;
  insert into public.clinic_prices (clinic_id, service_id, price_min, price_max, duration_min, note)
  select v_clinic, "serviceId", "priceMin", "priceMax", "durationMin", note
    from jsonb_to_recordset(p_prices)
      as x ("serviceId" uuid, "priceMin" integer, "priceMax" integer, "durationMin" smallint, note text);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Erstatter alle åbningsvinduer i én transaktion: [{ weekday, opensAt: "HH:MM", closesAt, isEmergency }].
-- Overlap afvises af triggeren clinic_opening_hours_guard(), og så rulles alt tilbage.
create function public.replace_opening_hours(p_hours jsonb)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_clinic uuid := public.require_clinic_editor();
  v_row record;
  v_count integer := 0;
begin
  if p_hours is null or jsonb_typeof(p_hours) <> 'array' or jsonb_array_length(p_hours) > 42 then
    raise exception 'INVALID_INPUT' using errcode = '22023';
  end if;
  delete from public.clinic_opening_hours where clinic_id = v_clinic;
  for v_row in
    select * from jsonb_to_recordset(p_hours)
      as x (weekday smallint, "opensAt" time, "closesAt" time, "isEmergency" boolean)
  loop
    insert into public.clinic_opening_hours (clinic_id, weekday, opens_at, closes_at, is_emergency)
    values (v_clinic, v_row.weekday, v_row."opensAt", v_row."closesAt", coalesce(v_row."isEmergency", false));
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.set_clinic_service_groups(uuid[]) from public, anon;
revoke all on function public.replace_clinic_prices(jsonb) from public, anon;
revoke all on function public.replace_opening_hours(jsonb) from public, anon;
grant execute on function public.set_clinic_service_groups(uuid[]) to authenticated;
grant execute on function public.replace_clinic_prices(jsonb) to authenticated;
grant execute on function public.replace_opening_hours(jsonb) to authenticated;
