-- Bevidst ændring af dentists_guard() (besluttet af brugeren) for demo-seed.
-- Service role har ingen auth.uid(), så admin-tjekket fejlede, og seed kunne ikke sætte is_verified/clinic_id.
-- Guarden honorerer KUN flaget tm.dentist_admin = 'demo', som kun demo_set_dentist_verification() sætter.
-- Andre flag (fx tm.system, der sættes af approve_summary, decide_response m.fl.) gives ingen adgang til is_verified/clinic_id.
-- Uden flaget gælder de eksisterende regler uændret.
-- id og authorization_id er låst også under flaget.

create or replace function public.dentists_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin boolean := public.is_admin();
  v_demo_admin boolean := tg_op = 'UPDATE'
    and coalesce(current_setting('tm.dentist_admin', true), '') = 'demo';
begin
  if v_admin then
    return new;
  end if;

  if v_demo_admin then
    -- Klinik-ejerskab og sættes af demo_set_dentist_verification(), som tjekker det selv.
    if new.id is distinct from old.id or new.authorization_id is distinct from old.authorization_id then
      raise exception 'Feltet kan kun ændres af admin' using errcode = '42501';
    end if;
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
