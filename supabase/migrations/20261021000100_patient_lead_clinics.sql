-- Trin 4.1: patienten læser klinikkens navn, by og logo på sine egne leads (architecture 10.9).
-- Patienter har ingen SELECT på clinics, og klinikken kan være 'removed' (så den ikke findes i public_*). Funktionen
-- returnerer derfor kun klinikker, som patientens EGNE leads peger på, også 'removed' (med removed = true og uden logo).
-- Ingen kontaktoplysninger, CVR, ejer eller adresse. p_case_id indsnævrer til én sag (null = alle egne sager).

create function public.patient_lead_clinics(p_case_id uuid default null)
returns table (
  lead_id uuid,
  clinic_id uuid,
  name text,
  city text,
  logo_path text,
  logo_updated_at timestamptz,
  removed boolean
)
language sql stable security definer set search_path = ''
as $$
  select
    l.id,
    k.id,
    k.name,
    k.city,
    case when k.status <> 'removed' then k.logo_path end,
    case when k.status <> 'removed' then k.logo_updated_at end,
    k.status = 'removed'
  from public.leads l
  join public.cases c on c.id = l.case_id
  join public.clinics k on k.id = l.clinic_id
  where c.patient_id = (select auth.uid())
    and (p_case_id is null or c.id = p_case_id);
$$;

revoke all on function public.patient_lead_clinics(uuid) from public, anon;
grant execute on function public.patient_lead_clinics(uuid) to authenticated;
