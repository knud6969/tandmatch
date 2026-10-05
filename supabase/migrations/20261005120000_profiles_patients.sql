-- Trin 1 (skelet): roller, profiles og patients, hjælpefunktioner og RLS.
-- Jf. docs/architecture.md 4.2, 4.3, 5.1, 5.2, 5.4.

create type public.user_role as enum ('patient', 'dentist', 'admin');

-- profiles: én række pr. auth.users. Oprettes af trigger (se 20261005120300_auth_triggers.sql).
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null,
  is_anonymous boolean not null default false,
  last_active_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- patients: én række pr. patient (også anonym). first_name er null for anonyme.
create table public.patients (
  id uuid primary key references public.profiles (id) on delete cascade,
  first_name text null check (first_name is null or char_length(first_name) between 1 and 50),
  postal_code text null check (postal_code is null or postal_code ~ '^[0-9]{4}$'),
  created_at timestamptz not null default now()
);

-- Hjælpefunktioner. Returnerer kun skalar/boolean og har fast search_path.
create or replace function public.auth_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.profiles p where p.id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.role = 'admin' from public.profiles p where p.id = auth.uid()), false);
$$;

-- Permanent konto = JWT-claim is_anonymous er ikke true.
create or replace function public.is_permanent_user()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false;
$$;

-- RPC: opdaterer last_active_at for den indloggede anonyme bruger (grundlag for 48-timers udløb).
-- Er den eneste skrivevej for profiles fra klienten; ændrer intet andet.
create or replace function public.touch_last_active()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles
     set last_active_at = now()
   where id = auth.uid()
     and is_anonymous = true;
$$;

revoke all on function public.touch_last_active() from public, anon;
grant execute on function public.touch_last_active() to authenticated;

-- RLS: profiles
alter table public.profiles enable row level security;

create policy profiles_select_own_or_admin on public.profiles
  for select
  using (id = (select auth.uid()) or public.is_admin());
-- Ingen insert/update/delete-policies: rolle, is_anonymous og oprettelse sker kun via trigger.

-- RLS: patients
alter table public.patients enable row level security;

create policy patients_select_own on public.patients
  for select
  using (id = (select auth.uid()));

create policy patients_insert_own on public.patients
  for insert
  with check (id = (select auth.uid()) and public.auth_role() = 'patient');

create policy patients_update_own on public.patients
  for update
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
-- Ingen delete-policy: sletning sker via kontosletning (cascade fra auth.users).
