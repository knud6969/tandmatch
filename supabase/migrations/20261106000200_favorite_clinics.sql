-- Favoritter: patientens gemte klinikker (features/clinics/README.md 4.3, 10.17; platform 5.4; PR B, 2026-11-04).
--  * is_public_clinic(): true for klinikker, der vises offentligt (verified, og imported uden ejer; samme regel som 5.1 regel 11).
--  * favorite_clinics med RLS: patienten ser, indsætter og sletter kun egne rækker; ingen UPDATE. Kun permanente konti.
--  * Trigger: højst 200 pr. patient (MAX_FAVORITE_CLINICS i lib/clinics/constants/favorites.ts) -> FAVORITE_LIMIT.
-- Klinikken kan ikke se, hvem der har gemt den: ingen policy eller funktion giver adgang på tværs af patienter.

create function public.is_public_clinic(p_clinic_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.clinics k
     where k.id = p_clinic_id and (k.status = 'verified' or (k.status = 'imported' and k.owner_id is null))
  );
$$;
revoke all on function public.is_public_clinic(uuid) from public, anon;
grant execute on function public.is_public_clinic(uuid) to authenticated;

create table public.favorite_clinics (
  patient_id uuid not null references public.patients (id) on delete cascade,
  clinic_id uuid not null references public.clinics (id),
  created_at timestamptz not null default now(),
  primary key (patient_id, clinic_id)
);
create index favorite_clinics_clinic_idx on public.favorite_clinics (clinic_id);

alter table public.favorite_clinics enable row level security;

create policy favorite_clinics_select_own on public.favorite_clinics
  for select to authenticated using (patient_id = (select auth.uid()));
create policy favorite_clinics_insert_own on public.favorite_clinics
  for insert to authenticated
  with check (patient_id = (select auth.uid()) and public.is_permanent_user() and public.is_public_clinic(clinic_id));
create policy favorite_clinics_delete_own on public.favorite_clinics
  for delete to authenticated using (patient_id = (select auth.uid()));

revoke all on public.favorite_clinics from anon, authenticated;
grant select, delete on public.favorite_clinics to authenticated;
grant insert (patient_id, clinic_id) on public.favorite_clinics to authenticated;

create function public.favorite_clinics_limit()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  -- Samtidige indsættelser for samme patient tælles efter hinanden.
  perform pg_advisory_xact_lock(hashtextextended('favorite_clinics:' || new.patient_id::text, 0));
  if (select count(*) from public.favorite_clinics f where f.patient_id = new.patient_id) >= 200 then -- MAX_FAVORITE_CLINICS
    raise exception 'FAVORITE_LIMIT' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.favorite_clinics_limit() from public, anon, authenticated;

create trigger favorite_clinics_limit
  before insert on public.favorite_clinics
  for each row execute function public.favorite_clinics_limit();
