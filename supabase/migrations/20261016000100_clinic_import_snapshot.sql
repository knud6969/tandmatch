-- Security (1.9.7, kritisk): en uverificeret ejer må aldrig kunne ændre, hvad patienter ser (architecture 3, 5.1 regel 11).
-- Hul: en bruger, der overtager en importeret klinik via CVR (uden bevis for ejerskab, [PROTOTYPE]), kunne som
-- 'registered' ændre navn, adresse, telefon og åbningstider og derefter slette sin konto. Klinikken gik tilbage til
-- 'imported' med de ændrede grunddata og blev synlig offentligt (public_clinics viser grunddata for imported).
-- Rettelse: ved overtagelsen gemmes de importerede grunddata i clinic_import_snapshots. Fjernes ejeren, uden at
-- klinikken er verificeret, gendannes grunddata og åbningstider fra snapshottet. En verificeret ejers ændringer bevares
-- (admin har godkendt ejeren). Snapshottet slettes, når ejeren fjernes.

create table public.clinic_import_snapshots (
  clinic_id uuid primary key references public.clinics (id) on delete cascade,
  name text not null,
  address text not null,
  postal_code text not null,
  city text not null,
  phone text null,
  lat double precision null,
  lng double precision null,
  opening_hours jsonb not null default '[]'::jsonb,
  taken_at timestamptz not null default now()
);

-- Kun triggere (security definer) læser og skriver. Ingen policies = ingen adgang.
alter table public.clinic_import_snapshots enable row level security;
revoke all on public.clinic_import_snapshots from public, anon, authenticated;

-- handle_new_user(): som i 20261015000200, men tager et snapshot af grunddata ved CVR-overtagelse.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_anonymous boolean := coalesce(new.is_anonymous, false);
  v_role public.user_role;
  v_first_name text := nullif(btrim(v_meta ->> 'first_name'), '');
  v_cvr text := nullif(btrim(v_meta ->> 'cvr'), '');
  v_postal text := nullif(btrim(v_meta ->> 'postal_code'), '');
  v_existing public.clinics%rowtype;
  v_lat double precision;
  v_lng double precision;
begin
  if v_anonymous then
    v_role := 'patient';
  elsif v_meta ->> 'role' = 'patient' then
    v_role := 'patient';
  elsif v_meta ->> 'role' = 'clinic' then
    v_role := 'clinic';
  else
    raise exception 'Ugyldig rolle ved oprettelse' using errcode = '22023';
  end if;

  insert into public.profiles (id, role, is_anonymous) values (new.id, v_role, v_anonymous);

  if v_role = 'patient' then
    insert into public.patients (id, first_name)
    values (new.id, case when v_anonymous then null else v_first_name end);
    return new;
  end if;

  -- Klinik: findes en importeret klinik uden ejer med samme CVR, knyttes kontoen til den [PROTOTYPE].
  if v_cvr is null or v_cvr !~ '^[0-9]{8}$' then
    raise exception 'Ugyldigt CVR-nummer' using errcode = '22023';
  end if;

  select * into v_existing from public.clinics where cvr = v_cvr for update;
  if found then
    if v_existing.owner_id is not null or v_existing.status <> 'imported' then
      raise exception 'CLINIC_EXISTS' using errcode = 'P0001';
    end if;
    -- Snapshot af de offentlige grunddata, før den uverificerede ejer kan ændre dem.
    insert into public.clinic_import_snapshots
      (clinic_id, name, address, postal_code, city, phone, lat, lng, opening_hours, taken_at)
    values (
      v_existing.id, v_existing.name, v_existing.address, v_existing.postal_code, v_existing.city, v_existing.phone,
      v_existing.lat, v_existing.lng,
      (select coalesce(jsonb_agg(jsonb_build_object(
                'weekday', h.weekday, 'opens_at', h.opens_at, 'closes_at', h.closes_at, 'is_emergency', h.is_emergency
              ) order by h.weekday, h.opens_at), '[]'::jsonb)
         from public.clinic_opening_hours h where h.clinic_id = v_existing.id),
      now()
    )
    on conflict (clinic_id) do update
      set name = excluded.name, address = excluded.address, postal_code = excluded.postal_code, city = excluded.city,
          phone = excluded.phone, lat = excluded.lat, lng = excluded.lng, opening_hours = excluded.opening_hours,
          taken_at = excluded.taken_at;
    perform set_config('tm.clinic_status', 'on', true);
    update public.clinics
       set owner_id = new.id, status = 'registered', verified_at = null
     where id = v_existing.id;
    perform set_config('tm.clinic_status', '', true);
  else
    select pc.lat, pc.lng into v_lat, v_lng from public.postal_codes pc where pc.postal_code = v_postal;
    insert into public.clinics (owner_id, status, cvr, name, address, postal_code, city, phone, lat, lng)
    values (
      new.id, 'registered', v_cvr,
      btrim(v_meta ->> 'clinic_name'), btrim(v_meta ->> 'address'), v_postal,
      btrim(v_meta ->> 'city'), nullif(btrim(v_meta ->> 'phone'), ''), v_lat, v_lng
    );
  end if;
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- clinics_guard(): som i 20261015000200, men en importeret klinik, hvis ejer fjernes uden at være verificeret, får sine
-- grunddata tilbage fra snapshottet.
create or replace function public.clinics_guard()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_system boolean := (select auth.uid()) is null or public.is_admin();
  v_flag boolean := coalesce(current_setting('tm.clinic_status', true), '') = 'on';
  v_trust_changed boolean;
  v_clinic_trust boolean;
  v_snap public.clinic_import_snapshots%rowtype;
begin
  if tg_op = 'UPDATE' then
    if old.status = 'removed' then
      raise exception 'CLINIC_REMOVED' using errcode = 'P0001';
    end if;
    -- owner_since følger owner_id og kan ikke sættes udefra.
    if new.owner_id is distinct from old.owner_id then
      new.owner_since := case when new.owner_id is null then null else now() end;
    else
      new.owner_since := old.owner_since;
    end if;
    if new.id is distinct from old.id then
      raise exception 'Feltet kan ikke ændres' using errcode = '42501';
    end if;
    if (new.status is distinct from old.status or new.verified_at is distinct from old.verified_at) and not v_flag then
      raise exception 'Status ændres kun af admin' using errcode = '42501';
    end if;
    if not v_system and (
         new.owner_id is distinct from old.owner_id
      or new.cvr is distinct from old.cvr
      or new.import_source is distinct from old.import_source
    ) then
      raise exception 'Feltet kan ikke ændres' using errcode = '42501';
    end if;
    -- Ejeren fjernes (konto slettet).
    if new.owner_id is null and old.owner_id is not null then
      if new.import_source is null then
        -- Selvoprettet klinik: endelig 'removed'. Kun navn, adresse, postnummer, by og koordinater bevares.
        v_clinic_trust := old.trustpilot_entered_by = 'clinic'; -- admin-indtastet Trustpilot bevares som for importerede
        new.status := 'removed';
        new.cvr := null;
        new.verified_at := null;
        new.phone := null;
        new.description := null;
        new.email := null;
        new.website := null;
        new.logo_path := null;
        new.logo_updated_at := null;
        if v_clinic_trust then
          new.trustpilot_url := null;
          new.trustpilot_score := null;
          new.trustpilot_review_count := null;
          new.trustpilot_updated_at := null;
          new.trustpilot_entered_by := null;
        end if;
        new.updated_at := now();
        return new;
      end if;
      -- Importeret klinik: en uverificeret ejers ændringer af grunddata rulles tilbage (security, 1.9.7).
      if old.status <> 'verified' then
        select * into v_snap from public.clinic_import_snapshots s where s.clinic_id = old.id;
        if found then
          new.name := v_snap.name;
          new.address := v_snap.address;
          new.postal_code := v_snap.postal_code;
          new.city := v_snap.city;
          new.phone := v_snap.phone;
          new.lat := v_snap.lat;
          new.lng := v_snap.lng;
        end if;
      end if;
      if new.status <> 'imported' then
        new.status := 'imported';
        new.verified_at := null;
      end if;
      new.updated_at := now();
      return new;
    end if;
    -- Ny adresse: placeringen følger postnummeret (præcis geokodning er [ÅBEN]).
    if new.postal_code is distinct from old.postal_code and not v_system then
      select pc.lat, pc.lng into new.lat, new.lng from public.postal_codes pc where pc.postal_code = new.postal_code;
      if not found then
        new.lat := null;
        new.lng := null;
      end if;
    end if;
    v_trust_changed := (new.trustpilot_url, new.trustpilot_score, new.trustpilot_review_count)
                       is distinct from (old.trustpilot_url, old.trustpilot_score, old.trustpilot_review_count);
    if v_trust_changed and not v_system then
      new.trustpilot_entered_by := 'clinic';
    elsif not v_system then
      new.trustpilot_entered_by := old.trustpilot_entered_by;
    end if;
    if new.trustpilot_score is distinct from old.trustpilot_score then
      new.trustpilot_updated_at := now();
    elsif not v_system then
      new.trustpilot_updated_at := old.trustpilot_updated_at;
    end if;
    new.updated_at := now();
  else
    new.owner_since := case when new.owner_id is null then null else now() end;
    if new.trustpilot_score is not null and new.trustpilot_updated_at is null then
      new.trustpilot_updated_at := now();
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.clinics_guard() from public, anon, authenticated;

-- clinics_after_owner_removed(): som i 20261015000200, men en importeret klinik, der ikke var verificeret, får sine
-- åbningstider tilbage fra snapshottet. Snapshottet slettes altid, når ejeren fjernes.
create or replace function public.clinics_after_owner_removed()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_snap public.clinic_import_snapshots%rowtype;
begin
  update public.bookings
     set status = 'cancelled', cancelled_by = 'clinic', cancelled_at = now()
   where clinic_id = new.id and (status = 'held' or (status = 'booked' and starts_at > now()));
  update public.leads
     set status = 'declined', decline_reason = 'clinic_left', responded_at = now()
   where clinic_id = new.id
     and (status in ('sent', 'accepted')
          or (status = 'booked' and not exists (
                select 1 from public.bookings b where b.lead_id = leads.id and b.status in ('held', 'booked', 'completed'))));

  delete from public.clinic_prices where clinic_id = new.id;
  delete from public.clinic_service_groups where clinic_id = new.id;
  delete from public.clinic_time_blocks where clinic_id = new.id;
  delete from public.clinic_dentists where clinic_id = new.id; -- portfolio_items følger med via cascade

  if new.import_source is null then
    -- (b) selvoprettet: også åbningstiderne slettes; selve rækken er ryddet og 'removed' (clinics_guard).
    delete from public.clinic_opening_hours where clinic_id = new.id;
    delete from public.clinic_import_snapshots where clinic_id = new.id;
    return null;
  end if;

  -- (a) importeret: en uverificeret ejers åbningstider erstattes af de importerede (security, 1.9.7).
  if old.status <> 'verified' then
    select * into v_snap from public.clinic_import_snapshots s where s.clinic_id = new.id;
    if found then
      delete from public.clinic_opening_hours where clinic_id = new.id;
      insert into public.clinic_opening_hours (clinic_id, weekday, opens_at, closes_at, is_emergency)
      select new.id, (h ->> 'weekday')::smallint, (h ->> 'opens_at')::time, (h ->> 'closes_at')::time,
             coalesce((h ->> 'is_emergency')::boolean, false)
        from jsonb_array_elements(v_snap.opening_hours) h;
    end if;
  end if;
  delete from public.clinic_import_snapshots where clinic_id = new.id;

  -- Grunddata (inkl. åbningstider og telefon) bevares; det klinikken selv har lagt ind, ryddes.
  update public.clinics
     set description = null,
         logo_path = null,
         logo_updated_at = null,
         email = null,
         website = null,
         trustpilot_url = case when trustpilot_entered_by = 'clinic' then null else trustpilot_url end,
         trustpilot_score = case when trustpilot_entered_by = 'clinic' then null else trustpilot_score end,
         trustpilot_review_count = case when trustpilot_entered_by = 'clinic' then null else trustpilot_review_count end,
         trustpilot_updated_at = case when trustpilot_entered_by = 'clinic' then null else trustpilot_updated_at end,
         trustpilot_entered_by = case when trustpilot_entered_by = 'clinic' then null else trustpilot_entered_by end
   where id = new.id;
  return null;
end;
$$;
revoke all on function public.clinics_after_owner_removed() from public, anon, authenticated;
