-- Trin 1 (skelet): vilkårs-accept (terms_acceptances) og samtykker (consents).
-- Vilkårs-accept er IKKE samtykke (architecture 2.5). Holdes i separate tabeller.

-- terms_acceptances: accept af brugervilkår og privatlivspolitik pr. version.
create table public.terms_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  terms_version text not null check (char_length(terms_version) between 1 and 40),
  privacy_version text not null check (char_length(privacy_version) between 1 and 40),
  accepted_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (user_id, terms_version, privacy_version)
);

alter table public.terms_acceptances enable row level security;

create policy terms_acceptances_select_own_or_admin on public.terms_acceptances
  for select
  using (user_id = (select auth.uid()) or public.is_admin());

create policy terms_acceptances_insert_own on public.terms_acceptances
  for insert
  with check (user_id = (select auth.uid()));
-- Ingen update/delete-policies: rækker ændres og slettes aldrig af brugeren.

-- consent_type: GDPR art. 9-samtykker.
create type public.consent_type as enum ('health_data_sharing', 'image_upload', 'ai_processing');

-- consents: ét samtykke pr. række. Aktivt = seneste række af typen med withdrawn_at is null.
create table public.consents (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  type public.consent_type not null,
  text_version text not null check (char_length(text_version) between 1 and 80),
  granted_at timestamptz not null default now(),
  granted_while_anonymous boolean not null default false,
  withdrawn_at timestamptz null,
  created_at timestamptz not null default now()
);

create index consents_patient_type_idx on public.consents (patient_id, type, granted_at desc);

-- Har den aktuelle bruger et aktivt samtykke af typen? Returnerer kun boolean.
create or replace function public.has_active_consent(p_type public.consent_type)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select c.withdrawn_at is null
      from public.consents c
      where c.patient_id = auth.uid()
        and c.type = p_type
      order by c.granted_at desc, c.created_at desc
      limit 1
    ),
    false
  );
$$;

alter table public.consents enable row level security;

create policy consents_select_own on public.consents
  for select
  using (patient_id = (select auth.uid()));

-- Indsættelse: egen patient, health_data_sharing kun for permanent konto,
-- og granted_while_anonymous skal matche sessionens status.
create policy consents_insert_own on public.consents
  for insert
  with check (
    patient_id = (select auth.uid())
    and withdrawn_at is null
    and (type <> 'health_data_sharing' or public.is_permanent_user())
    and granted_while_anonymous = not public.is_permanent_user()
  );
-- Ingen update/delete: tilbagetrækning sker via RPC withdraw_consent (trin 2).
