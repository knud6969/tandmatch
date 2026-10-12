-- Del 4: klinikker og deres data (architecture 3, 4.3, 5.2, 5.4).

create table public.clinics (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid null unique references public.profiles (id) on delete set null,
  status public.clinic_status not null,
  cvr text null unique check (cvr ~ '^[0-9]{8}$'),
  name text not null check (char_length(name) between 2 and 100),
  description text null check (char_length(description) <= 1000),
  address text not null check (char_length(address) between 1 and 200),
  postal_code text not null check (postal_code ~ '^[0-9]{4}$'),
  city text not null check (char_length(city) between 1 and 80),
  lat double precision null,
  lng double precision null,
  phone text null check (phone is null or phone ~ '^[+0-9 ()-]{6,20}$'),
  email text null check (email is null or char_length(email) <= 200),
  website text null check (website is null or char_length(website) <= 300),
  logo_path text null,
  trustpilot_url text null check (
    trustpilot_url is null
    or trustpilot_url ~ '^https://(dk|www)\.trustpilot\.com/'
  ),
  trustpilot_score numeric(2, 1) null check (trustpilot_score between 1.0 and 5.0),
  trustpilot_review_count integer null check (trustpilot_review_count >= 0),
  trustpilot_updated_at timestamptz null,
  trustpilot_entered_by text null check (trustpilot_entered_by in ('clinic', 'admin')),
  import_source text null check (char_length(import_source) <= 40),
  verified_at timestamptz null,
  -- Tidspunktet den nuværende ejer fik klinikken (sættes af clinics_guard; null uden ejer). Ejeren ser kun leads
  -- sendt efter dette tidspunkt, så en ny ejer ikke arver en tidligere ejers historik (security 0.7, H2).
  owner_since timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Trustpilot-data kræver at det er oplyst, hvem der har indtastet dem (mærkat, 8.4).
  check (
    trustpilot_entered_by is not null
    or (trustpilot_url is null and trustpilot_score is null and trustpilot_review_count is null)
  ),
  check (status = 'imported' or owner_id is not null),
  check ((owner_id is null) = (owner_since is null))
);

create index clinics_postal_idx on public.clinics (postal_code);

create table public.clinic_prices (
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  service_id uuid not null references public.services (id),
  price_min integer not null check (price_min >= 0),
  price_max integer not null,
  duration_min smallint not null check (duration_min between 5 and 480),
  note text null check (char_length(note) <= 200),
  updated_at timestamptz not null default now(),
  primary key (clinic_id, service_id),
  check (price_max >= price_min)
);

create table public.clinic_opening_hours (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7),
  opens_at time not null,
  closes_at time not null,
  is_emergency boolean not null default false,
  created_at timestamptz not null default now(),
  check (opens_at < closes_at)
);

create index clinic_opening_hours_clinic_idx on public.clinic_opening_hours (clinic_id, weekday);

create table public.clinic_time_blocks (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  note text null check (char_length(note) <= 200),
  created_at timestamptz not null default now(),
  check (starts_at < ends_at)
);

create index clinic_time_blocks_clinic_idx on public.clinic_time_blocks (clinic_id, starts_at);

create table public.clinic_dentists (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  full_name text not null check (char_length(full_name) between 1 and 100),
  title text null check (char_length(title) <= 100),
  bio text null check (char_length(bio) <= 1000),
  photo_path text null,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now()
);

create index clinic_dentists_clinic_idx on public.clinic_dentists (clinic_id);

create table public.portfolio_items (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  dentist_id uuid not null references public.clinic_dentists (id) on delete cascade,
  service_id uuid null references public.services (id),
  image_path text not null unique,
  caption text null check (char_length(caption) <= 200),
  patient_consent_confirmed_at timestamptz not null,
  consent_text_version text not null check (char_length(consent_text_version) between 1 and 80),
  created_at timestamptz not null default now()
);

create index portfolio_items_clinic_idx on public.portfolio_items (clinic_id);

-- Hjælpefunktioner (5.2)
create function public.auth_clinic_id()
returns uuid
language sql stable security definer set search_path = ''
as $$ select c.id from public.clinics c where c.owner_id = (select auth.uid()); $$;

create function public.is_clinic_owner(p_clinic_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.clinics c where c.id = p_clinic_id and c.owner_id = (select auth.uid()));
$$;

create function public.is_verified_clinic_owner()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.clinics c where c.owner_id = (select auth.uid()) and c.status = 'verified'
  );
$$;

revoke all on function public.auth_clinic_id() from public, anon;
revoke all on function public.is_clinic_owner(uuid) from public, anon;
revoke all on function public.is_verified_clinic_owner() from public, anon;
grant execute on function public.auth_clinic_id() to authenticated, service_role;
grant execute on function public.is_clinic_owner(uuid) to authenticated, service_role;
grant execute on function public.is_verified_clinic_owner() to authenticated, service_role;

-- clinics_guard(): beskyttede felter og Trustpilot-regler.
-- "System" = ingen bruger-JWT (service role, signup-trigger, migration/psql) eller admin.
-- status og verified_at ændres kun af admin_set_clinic_status() via transaktionsflaget tm.clinic_status.
create function public.clinics_guard()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_system boolean := (select auth.uid()) is null or public.is_admin();
  v_flag boolean := coalesce(current_setting('tm.clinic_status', true), '') = 'on';
  v_trust_changed boolean;
begin
  if tg_op = 'UPDATE' then
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
    -- FK-handlingen "on delete set null" på owner_id: klinikken uden konto er kun grunddata.
    if new.owner_id is null and old.owner_id is not null and new.status <> 'imported' then
      new.status := 'imported';
      new.verified_at := null;
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

create trigger clinics_guard
  before insert or update on public.clinics
  for each row execute function public.clinics_guard();
revoke all on function public.clinics_guard() from public, anon, authenticated;

-- admin_set_clinic_status(): kun service role (seed og admin-scripts) [PROTOTYPE].
create function public.admin_set_clinic_status(p_clinic_id uuid, p_status public.clinic_status)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_clinic public.clinics%rowtype;
begin
  select * into v_clinic from public.clinics where id = p_clinic_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if p_status <> 'imported' and v_clinic.owner_id is null then
    raise exception 'CLINIC_HAS_NO_OWNER' using errcode = 'P0001';
  end if;
  if p_status = 'imported' and v_clinic.owner_id is not null then
    raise exception 'CLINIC_HAS_OWNER' using errcode = 'P0001';
  end if;
  perform set_config('tm.clinic_status', 'on', true);
  update public.clinics
     set status = p_status,
         verified_at = case when p_status = 'verified' then coalesce(verified_at, now()) else null end
   where id = p_clinic_id;
  perform set_config('tm.clinic_status', '', true);
end;
$$;

revoke all on function public.admin_set_clinic_status(uuid, public.clinic_status) from public, anon, authenticated;
grant execute on function public.admin_set_clinic_status(uuid, public.clinic_status) to service_role;

-- Åbningstider: overlappende vinduer samme dag afvises.
create function public.clinic_opening_hours_guard()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (
    select 1 from public.clinic_opening_hours h
     where h.clinic_id = new.clinic_id
       and h.weekday = new.weekday
       and h.id <> new.id
       and h.opens_at < new.closes_at
       and new.opens_at < h.closes_at
  ) then
    raise exception 'OPENING_HOURS_OVERLAP' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger clinic_opening_hours_guard
  before insert or update on public.clinic_opening_hours
  for each row execute function public.clinic_opening_hours_guard();
revoke all on function public.clinic_opening_hours_guard() from public, anon, authenticated;

-- Portefølje: tandlægen skal tilhøre samme klinik; klinik-id kan ikke ændres.
create function public.portfolio_items_guard()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.clinic_dentists d where d.id = new.dentist_id and d.clinic_id = new.clinic_id
  ) then
    raise exception 'Tandlægen tilhører ikke klinikken' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger portfolio_items_guard
  before insert or update on public.portfolio_items
  for each row execute function public.portfolio_items_guard();
revoke all on function public.portfolio_items_guard() from public, anon, authenticated;

-- updated_at på prisliste
create function public.touch_updated_at()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.touch_updated_at() from public, anon, authenticated;

create trigger clinic_prices_touch
  before update on public.clinic_prices
  for each row execute function public.touch_updated_at();

-- RLS
alter table public.clinics enable row level security;
alter table public.clinic_prices enable row level security;
alter table public.clinic_opening_hours enable row level security;
alter table public.clinic_time_blocks enable row level security;
alter table public.clinic_dentists enable row level security;
alter table public.portfolio_items enable row level security;

-- clinics: ingen SELECT for anon; offentligt kun via public_*-funktioner (001000).
create policy clinics_select_owner_or_admin on public.clinics
  for select to authenticated using (public.is_clinic_owner(id) or public.is_admin());
create policy clinics_update_owner on public.clinics
  for update to authenticated
  using (public.is_clinic_owner(id)) with check (public.is_clinic_owner(id));
revoke insert, delete, truncate on public.clinics from authenticated;
revoke update on public.clinics from authenticated;
grant update (name, description, address, postal_code, city, phone, email, website,
              trustpilot_url, trustpilot_score, trustpilot_review_count) on public.clinics to authenticated;

-- Ejer-tabeller: samme mønster.
create policy clinic_prices_select_owner on public.clinic_prices
  for select to authenticated using (public.is_clinic_owner(clinic_id));
create policy clinic_prices_insert_owner on public.clinic_prices
  for insert to authenticated with check (public.is_clinic_owner(clinic_id) and public.is_permanent_user());
create policy clinic_prices_update_owner on public.clinic_prices
  for update to authenticated
  using (public.is_clinic_owner(clinic_id) and public.is_permanent_user())
  with check (public.is_clinic_owner(clinic_id) and public.is_permanent_user());
create policy clinic_prices_delete_owner on public.clinic_prices
  for delete to authenticated using (public.is_clinic_owner(clinic_id) and public.is_permanent_user());

create policy clinic_opening_hours_select_owner on public.clinic_opening_hours
  for select to authenticated using (public.is_clinic_owner(clinic_id));
create policy clinic_opening_hours_insert_owner on public.clinic_opening_hours
  for insert to authenticated with check (public.is_clinic_owner(clinic_id) and public.is_permanent_user());
create policy clinic_opening_hours_update_owner on public.clinic_opening_hours
  for update to authenticated
  using (public.is_clinic_owner(clinic_id) and public.is_permanent_user())
  with check (public.is_clinic_owner(clinic_id) and public.is_permanent_user());
create policy clinic_opening_hours_delete_owner on public.clinic_opening_hours
  for delete to authenticated using (public.is_clinic_owner(clinic_id) and public.is_permanent_user());

create policy clinic_time_blocks_select_owner on public.clinic_time_blocks
  for select to authenticated using (public.is_clinic_owner(clinic_id));
create policy clinic_time_blocks_insert_owner on public.clinic_time_blocks
  for insert to authenticated with check (public.is_clinic_owner(clinic_id) and public.is_permanent_user());
create policy clinic_time_blocks_update_owner on public.clinic_time_blocks
  for update to authenticated
  using (public.is_clinic_owner(clinic_id) and public.is_permanent_user())
  with check (public.is_clinic_owner(clinic_id) and public.is_permanent_user());
create policy clinic_time_blocks_delete_owner on public.clinic_time_blocks
  for delete to authenticated using (public.is_clinic_owner(clinic_id) and public.is_permanent_user());

create policy clinic_dentists_select_owner on public.clinic_dentists
  for select to authenticated using (public.is_clinic_owner(clinic_id));
create policy clinic_dentists_insert_owner on public.clinic_dentists
  for insert to authenticated with check (public.is_clinic_owner(clinic_id) and public.is_permanent_user());
create policy clinic_dentists_update_owner on public.clinic_dentists
  for update to authenticated
  using (public.is_clinic_owner(clinic_id) and public.is_permanent_user())
  with check (public.is_clinic_owner(clinic_id) and public.is_permanent_user());
create policy clinic_dentists_delete_owner on public.clinic_dentists
  for delete to authenticated using (public.is_clinic_owner(clinic_id) and public.is_permanent_user());

-- portfolio_items: kun service role indsætter og sletter (9.5). Ejeren må ændre caption og service_id.
create policy portfolio_items_select_owner on public.portfolio_items
  for select to authenticated using (public.is_clinic_owner(clinic_id));
create policy portfolio_items_update_owner on public.portfolio_items
  for update to authenticated
  using (public.is_clinic_owner(clinic_id))
  with check (public.is_clinic_owner(clinic_id));
revoke insert, delete, truncate on public.portfolio_items from authenticated;
revoke update on public.portfolio_items from authenticated;
grant update (caption, service_id) on public.portfolio_items to authenticated;
