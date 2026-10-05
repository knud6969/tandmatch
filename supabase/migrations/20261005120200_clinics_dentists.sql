-- Trin 1 (skelet): klinikker, postnummer-opslag og tandlæger med verifikations-flag.
-- En ny tandlæge kan ikke matches før admin har sat is_verified (architecture 3, 4.3, 6.6).

create type public.cosmetic_category as enum ('diastema', 'facings', 'blegning', 'retainer', 'andet_kosmetisk');

-- postal_codes: offentligt opslag postnummer -> by og koordinater. Seedes senere.
create table public.postal_codes (
  postal_code text primary key check (postal_code ~ '^[0-9]{4}$'),
  city text not null check (char_length(city) between 1 and 80),
  lat double precision not null,
  lng double precision not null
);

alter table public.postal_codes enable row level security;

create policy postal_codes_select_public on public.postal_codes
  for select
  using (true);
-- Ingen skrive-policies: kun migrationer/seed skriver her.

-- clinics: offentlige erhvervsoplysninger + manuelt indtastet Trustpilot-data.
-- created_by er en tilføjelse til 4.3: den der opretter en klinik er den eneste, en tandlæge
-- må knytte sig til (forhindrer at en tandlæge flytter sig ind i andres klinik og får redigeringsret).
create table public.clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  address text not null check (char_length(address) between 2 and 160),
  postal_code text not null check (postal_code ~ '^[0-9]{4}$'),
  city text not null check (char_length(city) between 1 and 80),
  lat double precision null,
  lng double precision null,
  phone text null check (phone is null or char_length(phone) <= 30),
  website text null check (website is null or char_length(website) <= 200),
  trustpilot_url text null check (trustpilot_url is null or trustpilot_url ~ '^https://(dk|www)\.trustpilot\.com/'),
  trustpilot_score numeric(2, 1) null check (trustpilot_score is null or (trustpilot_score >= 1.0 and trustpilot_score <= 5.0)),
  trustpilot_review_count integer null check (trustpilot_review_count is null or trustpilot_review_count >= 0),
  trustpilot_updated_at timestamptz null,
  created_by uuid null references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create or replace function public.clinics_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.created_by is distinct from old.created_by then
    raise exception 'created_by kan ikke ændres' using errcode = '42501';
  end if;
  if new.trustpilot_score is distinct from old.trustpilot_score then
    new.trustpilot_updated_at := now();
  end if;
  return new;
end;
$$;

create trigger clinics_before_update
  before update on public.clinics
  for each row execute function public.clinics_before_update();

alter table public.clinics enable row level security;

create policy clinics_select_public on public.clinics
  for select
  using (true);

create policy clinics_insert_dentist on public.clinics
  for insert
  with check (
    created_by = (select auth.uid())
    and public.auth_role() = 'dentist'
    and public.is_permanent_user()
  );

-- dentists: tandlægens offentlige profil og verifikations-flag.
create table public.dentists (
  id uuid primary key references public.profiles (id) on delete cascade,
  clinic_id uuid null references public.clinics (id) on delete set null,
  full_name text not null check (char_length(full_name) between 2 and 100),
  title text null check (title is null or char_length(title) <= 60),
  bio text null check (bio is null or char_length(bio) <= 2000),
  photo_path text null check (photo_path is null or char_length(photo_path) <= 300),
  authorization_id text not null check (authorization_id ~ '^[A-Za-z0-9-]{3,20}$'),
  is_verified boolean not null default false,
  is_active boolean not null default true,
  accepts_cosmetic boolean not null default false,
  cosmetic_categories public.cosmetic_category[] not null default '{}',
  next_available_at timestamptz null,
  next_available_updated_at timestamptz null,
  created_at timestamptz not null default now()
);

-- Guard: felter en tandlæge aldrig selv må ændre. Admin må alt.
create or replace function public.dentists_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin boolean := public.is_admin();
begin
  if v_admin then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.is_verified then
      raise exception 'is_verified kan kun sættes af admin' using errcode = '42501';
    end if;
    if new.clinic_id is not null then
      raise exception 'clinic_id sættes efter oprettelse' using errcode = '42501';
    end if;
    return new;
  end if;

  if new.id is distinct from old.id
     or new.is_verified is distinct from old.is_verified
     or new.authorization_id is distinct from old.authorization_id then
    raise exception 'Feltet kan kun ændres af admin' using errcode = '42501';
  end if;

  -- Må kun knytte sig til en klinik, man selv har oprettet (eller fjerne sig fra den).
  if new.clinic_id is distinct from old.clinic_id and new.clinic_id is not null then
    if not exists (
      select 1 from public.clinics c
      where c.id = new.clinic_id and c.created_by = (select auth.uid())
    ) then
      raise exception 'Ugyldig klinik' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

create trigger dentists_guard
  before insert or update on public.dentists
  for each row execute function public.dentists_guard();

alter table public.dentists enable row level security;

-- Offentlig læsning kun for verificerede og aktive tandlæger; egen række altid; admin alt.
create policy dentists_select_public_or_own on public.dentists
  for select
  using (
    (is_verified and is_active)
    or id = (select auth.uid())
    or public.is_admin()
  );

create policy dentists_insert_own on public.dentists
  for insert
  with check (
    id = (select auth.uid())
    and public.auth_role() = 'dentist'
    and public.is_permanent_user()
    and is_verified = false
  );

create policy dentists_update_own on public.dentists
  for update
  using (id = (select auth.uid()) and public.auth_role() = 'dentist')
  with check (id = (select auth.uid()) and public.auth_role() = 'dentist');

create policy dentists_update_admin on public.dentists
  for update
  using (public.is_admin())
  with check (public.is_admin());
-- Ingen delete-policy.

-- Klinik-opdatering kræver medlemskab. Policyen refererer til dentists, så den oprettes efter tabellen.
create policy clinics_update_member on public.clinics
  for update
  using (
    exists (
      select 1 from public.dentists d
      where d.id = (select auth.uid()) and d.clinic_id = clinics.id
    )
  )
  with check (
    exists (
      select 1 from public.dentists d
      where d.id = (select auth.uid()) and d.clinic_id = clinics.id
    )
  );
-- Ingen delete-policy.
