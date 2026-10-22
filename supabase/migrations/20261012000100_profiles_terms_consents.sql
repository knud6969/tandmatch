-- Del 2: profiles, patients, vilkårs-accept, samtykker, postnumre og hjælpefunktioner uden domæneafhængighed
-- (architecture 4.3, 5.1, 5.2, 5.4).

-- profiles: én række pr. auth.users. Oprettes af trigger (000400).
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null,
  is_anonymous boolean not null default false,
  last_active_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- patients: også anonyme. first_name er null for anonyme.
create table public.patients (
  id uuid primary key references public.profiles (id) on delete cascade,
  first_name text null check (first_name is null or char_length(first_name) between 1 and 50),
  phone text null check (phone is null or phone ~ '^[+0-9 ()-]{6,20}$'),
  postal_code text null check (postal_code is null or postal_code ~ '^[0-9]{4}$'),
  created_at timestamptz not null default now()
);

create table public.postal_codes (
  postal_code text primary key check (postal_code ~ '^[0-9]{4}$'),
  city text not null check (char_length(city) between 1 and 80),
  lat double precision not null,
  lng double precision not null
);

create table public.terms_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  terms_version text not null check (char_length(terms_version) between 1 and 40),
  privacy_version text not null check (char_length(privacy_version) between 1 and 40),
  accepted_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (user_id, terms_version, privacy_version)
);

-- Kendte samtykketekster. ai_disclosure = teksten oplyser om AI-behandling af billeder.
create table public.consent_text_versions (
  type public.consent_type not null,
  text_version text primary key check (char_length(text_version) between 1 and 80),
  ai_disclosure boolean not null default false
);

insert into public.consent_text_versions (type, text_version, ai_disclosure) values
  ('ai_processing', 'ai_processing@v0-prototype', false),
  ('image_upload', 'image_upload@v1-ai-disclosure', true),
  ('health_data_sharing', 'health_data_sharing@v0-prototype', false);

create table public.consents (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  type public.consent_type not null,
  text_version text not null references public.consent_text_versions (text_version),
  granted_at timestamptz not null default now(),
  granted_while_anonymous boolean not null default false,
  withdrawn_at timestamptz null,
  pending_storage_paths text[] null,
  cleanup_done boolean not null default true,
  created_at timestamptz not null default now()
);

create index consents_patient_type_idx on public.consents (patient_id, type, created_at desc);

-- Hjælpefunktioner (5.2). Alle har fast search_path og returnerer kun skalarer.
create function public.auth_role()
returns public.user_role
language sql stable security definer set search_path = ''
as $$ select p.role from public.profiles p where p.id = (select auth.uid()); $$;

create function public.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce((select p.role = 'admin' from public.profiles p where p.id = (select auth.uid())), false); $$;

-- Permanent konto = JWT-claim is_anonymous er ikke true.
create function public.is_permanent_user()
returns boolean
language sql stable security invoker set search_path = ''
as $$ select coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false; $$;

-- Aktivt samtykke = seneste række af typen (efter created_at, som serveren sætter) med withdrawn_at null.
create function public.has_active_consent(p_type public.consent_type)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select c.withdrawn_at is null
       from public.consents c
      where c.patient_id = (select auth.uid()) and c.type = p_type
      order by c.created_at desc
      limit 1),
    false);
$$;

create function public.is_allowed_consent_text(p_type public.consent_type, p_version text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.consent_text_versions v where v.type = p_type and v.text_version = p_version);
$$;

-- granted_at og created_at sættes af databasen, ikke klienten.
create function public.consents_before_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.granted_at := clock_timestamp();
  new.created_at := clock_timestamp();
  new.withdrawn_at := null;
  new.pending_storage_paths := null;
  new.cleanup_done := true;
  return new;
end;
$$;

create trigger consents_before_insert
  before insert on public.consents
  for each row execute function public.consents_before_insert();

revoke all on function public.consents_before_insert() from public, anon, authenticated;

revoke all on function public.auth_role() from public, anon;
revoke all on function public.is_admin() from public, anon;
revoke all on function public.is_permanent_user() from public, anon;
revoke all on function public.has_active_consent(public.consent_type) from public, anon;
revoke all on function public.is_allowed_consent_text(public.consent_type, text) from public, anon;
grant execute on function public.auth_role() to authenticated, service_role;
grant execute on function public.is_admin() to authenticated, service_role;
grant execute on function public.is_permanent_user() to authenticated, service_role;
grant execute on function public.has_active_consent(public.consent_type) to authenticated, service_role;
grant execute on function public.is_allowed_consent_text(public.consent_type, text) to authenticated, service_role;

-- RLS
alter table public.profiles enable row level security;
alter table public.patients enable row level security;
alter table public.postal_codes enable row level security;
alter table public.terms_acceptances enable row level security;
alter table public.consent_text_versions enable row level security;
alter table public.consents enable row level security;

create policy profiles_select_own_or_admin on public.profiles
  for select to authenticated using (id = (select auth.uid()) or public.is_admin());
-- Ingen insert/update/delete: sker kun via triggere og funktioner.

create policy patients_select_own on public.patients
  for select to authenticated using (id = (select auth.uid()));
create policy patients_update_own on public.patients
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
revoke insert, delete, truncate on public.patients from authenticated;
revoke update on public.patients from authenticated;
grant update (first_name, postal_code, phone) on public.patients to authenticated;

create policy postal_codes_select_public on public.postal_codes
  for select to anon, authenticated using (true);
grant select on public.postal_codes to anon;

create policy terms_acceptances_select_own_or_admin on public.terms_acceptances
  for select to authenticated using (user_id = (select auth.uid()) or public.is_admin());
create policy terms_acceptances_insert_own on public.terms_acceptances
  for insert to authenticated with check (user_id = (select auth.uid()));
revoke update, delete, truncate on public.terms_acceptances from authenticated;

create policy consent_text_versions_select_public on public.consent_text_versions
  for select to anon, authenticated using (true);
grant select on public.consent_text_versions to anon;

create policy consents_select_own on public.consents
  for select to authenticated using (patient_id = (select auth.uid()));
create policy consents_insert_own on public.consents
  for insert to authenticated
  with check (
    patient_id = (select auth.uid())
    and public.is_allowed_consent_text(type, text_version)
    and (type <> 'health_data_sharing' or public.is_permanent_user())
    and granted_while_anonymous = not public.is_permanent_user()
  );
-- Ingen update/delete: tilbagetrækning sker via withdraw_consent() (001100).
revoke update, delete, truncate on public.consents from authenticated;
