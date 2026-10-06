-- Demo-seed: bevidst admin-sti til at sætte is_verified og clinic_id på en tandlæge.
-- Kun service_role må kalde funktionen (seed og admin-scripts, architecture 2.3, 5.1 punkt 7).
-- Funktionen fjerner ikke regler for patienter eller tandlæger. Den sætter kun det specifikke flag
-- tm.dentist_admin = 'demo' lokalt i transaktionen. Kun denne funktion sætter flaget, og dentists_guard()
-- honorerer det ikke for andre flag (fx tm.system), så andre funktioner ikke kan ændre is_verified.
-- Klinik må kun knyttes, hvis tandlægen selv har oprettet den (samme regel som dentists_guard).

create or replace function public.demo_set_dentist_verification(
  p_user_id uuid,
  p_clinic_id uuid,
  p_verified boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null or p_verified is null then
    raise exception 'Ugyldige parametre' using errcode = '22023';
  end if;

  if not exists (select 1 from public.dentists d where d.id = p_user_id) then
    raise exception 'Ingen tandlæge med det id' using errcode = 'P0002';
  end if;

  if p_clinic_id is not null and not exists (
    select 1 from public.clinics c
    where c.id = p_clinic_id and c.created_by = p_user_id
  ) then
    raise exception 'Klinikken er ikke oprettet af tandlægen' using errcode = '42501';
  end if;

  perform set_config('tm.dentist_admin', 'demo', true);

  update public.dentists
     set is_verified = p_verified,
         clinic_id = p_clinic_id
   where id = p_user_id;

  perform set_config('tm.dentist_admin', '', true);
end;
$$;

revoke all on function public.demo_set_dentist_verification(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.demo_set_dentist_verification(uuid, uuid, boolean) to service_role;
