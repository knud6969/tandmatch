-- 1.9.1b del 2: en selvoprettet klinik (import_source is null), hvis konto slettes, får status 'removed' (architecture 3,
-- 4.3, 5.3, åbent spørgsmål 28). Rækken slettes aldrig og intet cascades, så patienternes leads, beskeder, bookinger og
-- anmeldelser har en klinik at pege på (navn og adresse). 'removed' er endelig: CVR nulstilles, så virksomheden kan
-- oprette sig igen som en ny klinik, og rækken er usynlig overalt og kan ikke ændres, overtages eller få leads.

-- En 'removed' klinik har ingen ejer.
alter table public.clinics drop constraint clinics_check1;
alter table public.clinics add constraint clinics_status_owner_check
  check (status in ('imported', 'removed') or owner_id is not null);

-- clinics_guard(): som før, men (a) en removed klinik kan ikke ændres, og (b) når ejeren fjernes (FK "on delete set null"),
-- bliver en importeret klinik 'imported', mens en selvoprettet bliver 'removed' med klinikdata og CVR ryddet.
create or replace function public.clinics_guard()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_system boolean := (select auth.uid()) is null or public.is_admin();
  v_flag boolean := coalesce(current_setting('tm.clinic_status', true), '') = 'on';
  v_trust_changed boolean;
  v_clinic_trust boolean;
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
      elsif new.status <> 'imported' then
        new.status := 'imported';
        new.verified_at := null;
      end if;
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

-- Trigger efter fjernet ejer: leads og bookinger som før; derefter klinikdata. Selvoprettet klinik (removed): rækken
-- er allerede ryddet af clinics_guard(); her slettes de tilhørende rækker, inkl. åbningstider. Importeret klinik: som
-- i 20261014000400 (åbningstider og telefon bevares).
create or replace function public.clinics_after_owner_removed()
returns trigger
language plpgsql security definer set search_path = ''
as $$
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
    return null;
  end if;

  -- (a) importeret: grunddata (inkl. åbningstider og telefon) bevares.
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

-- CVR-tilknytning ved signup kun til en importeret klinik uden ejer. Alt andet med samme CVR er optaget.
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

create or replace function public.is_cvr_claimed(p_cvr text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.clinics c where c.cvr = p_cvr and (c.owner_id is not null or c.status <> 'imported')
  );
$$;

-- public_clinics(): som før, men 'removed' udelukkes eksplicit (forsvar i dybden). public_clinic_profile bygger på den.
create or replace function public.public_clinics(p_service_ids uuid[] default null, p_clinic_ids uuid[] default null)
returns table (
  id uuid,
  name text,
  status public.clinic_status,
  address text,
  postal_code text,
  city text,
  lat double precision,
  lng double precision,
  phone text,
  website text,
  trustpilot_url text,
  trustpilot_score numeric,
  trustpilot_review_count integer,
  trustpilot_updated_at timestamptz,
  trustpilot_entered_by text,
  opening_hours jsonb,
  logo_path text,
  logo_updated_at timestamptz,
  prices jsonb,
  has_emergency_hours boolean
)
language sql stable security definer set search_path = ''
as $$
  select
    k.id, k.name, k.status,
    k.address, k.postal_code, k.city, k.lat, k.lng, k.phone, k.website,
    k.trustpilot_url, k.trustpilot_score, k.trustpilot_review_count, k.trustpilot_updated_at, k.trustpilot_entered_by,
    (select coalesce(jsonb_agg(jsonb_build_object(
              'weekday', h.weekday, 'opens_at', to_char(h.opens_at, 'HH24:MI'),
              'closes_at', to_char(h.closes_at, 'HH24:MI'), 'is_emergency', h.is_emergency
            ) order by h.weekday, h.opens_at), '[]'::jsonb)
       from public.clinic_opening_hours h where h.clinic_id = k.id),
    case when k.status = 'verified' then k.logo_path end,
    case when k.status = 'verified' then k.logo_updated_at end,
    case when k.status = 'verified' then
      (select coalesce(jsonb_agg(jsonb_build_object(
                'service_id', s.id, 'service_slug', s.slug, 'service_name', s.name,
                'group_id', g.id, 'group_slug', g.slug,
                'price_min', cp.price_min, 'price_max', cp.price_max,
                'duration_min', cp.duration_min, 'note', cp.note
              ) order by g.sort_order, s.sort_order), '[]'::jsonb)
         from public.clinic_prices cp
         join public.services s on s.id = cp.service_id and s.is_active
         join public.service_groups g on g.id = s.group_id and g.is_active
        where cp.clinic_id = k.id and p_service_ids is not null and cp.service_id = any (p_service_ids)) end,
    case when k.status = 'verified' then
      exists (select 1 from public.clinic_opening_hours h where h.clinic_id = k.id and h.is_emergency) end
  from public.clinics k
  where k.status <> 'removed'
    and (k.status = 'verified' or (k.status = 'imported' and k.owner_id is null))
    and (p_clinic_ids is null or k.id = any (p_clinic_ids))
  order by k.name;
$$;

-- En removed klinik kan ikke få leads (forsvar i dybden ud over send_leads(), som kun accepterer verificerede).
create function public.leads_clinic_guard()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from public.clinics k where k.id = new.clinic_id and k.status = 'removed') then
    raise exception 'CLINIC_NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.leads_clinic_guard() from public, anon, authenticated;

create trigger leads_clinic_guard
  before insert on public.leads
  for each row execute function public.leads_clinic_guard();
