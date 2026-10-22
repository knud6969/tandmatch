-- Trin 5.5a (security H1 og L1, review 5; architecture 5.3, 5.4, 5.5, 10.12).
--   * H1: klinikken har ikke længere SELECT på leads. Policyen leads_select_case_owner_or_clinic gav en klinik adgang til
--     hele rækken, inkl. case_id (som i sig selv er en nøgle til sagens øvrige data). Nu kan kun sagens ejer læse leads
--     direkte; klinikken læser via clinic_*-funktionerne og clinic_lead_status().
--   * L1: authenticated har kun SELECT på de kolonner i messages, der ikke afslører patient_id (ikke sender_id).
--   * Review 5: clinic_leads().image_count tæller kun billeder med aktivt image_upload-samtykke (som clinic_lead_images()).

-- H1
drop policy leads_select_case_owner_or_clinic on public.leads;
create policy leads_select_case_owner on public.leads
  for select to authenticated using (public.is_case_owner(case_id));

-- Leadets status for den verificerede ejer af klinikken bag leadet (sent_at >= owner_since), ellers null.
-- Bruges af beskedtråden til at afgøre, om tråden er åben. Returnerer intet andet end statussen.
create function public.clinic_lead_status(p_lead_id uuid)
returns public.lead_status
language sql stable security definer set search_path = ''
as $$
  select l.status
    from public.leads l
    join public.clinics k on k.id = l.clinic_id
   where l.id = p_lead_id
     and k.owner_id = (select auth.uid())
     and k.status = 'verified'
     and l.sent_at >= k.owner_since;
$$;

revoke all on function public.clinic_lead_status(uuid) from public, anon;
grant execute on function public.clinic_lead_status(uuid) to authenticated, service_role;

-- L1
revoke select on public.messages from authenticated;
grant select (id, lead_id, sender_role, body, created_at, read_at) on public.messages to authenticated;

-- Review 5
create or replace function public.clinic_leads(p_status public.lead_status default null)
returns table (
  lead_id uuid,
  status public.lead_status,
  is_emergency boolean,
  service_names text[],
  postal_code text,
  city text,
  distance_km numeric,
  preferred_timeframe public.case_timeframe,
  requested_starts_at timestamptz,
  image_count integer,
  sent_at timestamptz,
  seen_at timestamptz,
  withdrawn_at timestamptz,
  unread_messages integer
)
language sql stable security definer set search_path = ''
as $$
  select
    l.id,
    l.status,
    case when l.status <> 'withdrawn' then c.is_emergency end,
    case when l.status <> 'withdrawn' then
      (select array_agg(s.name order by s.sort_order, s.name)
         from public.case_services cs join public.services s on s.id = cs.service_id
        where cs.case_id = c.id) end,
    case when l.status <> 'withdrawn' then c.postal_code end,
    case when l.status <> 'withdrawn' then pc.city end,
    case when l.status <> 'withdrawn' then l.distance_km end,
    case when l.status <> 'withdrawn' then c.preferred_timeframe end,
    case when l.status <> 'withdrawn' then l.requested_starts_at end,
    case when l.status <> 'withdrawn' then
      (select count(*)::integer from public.case_images i
        where i.case_id = c.id
          and c.status <> 'draft'
          and coalesce((
                select k2.withdrawn_at is null
                  from public.consents k2
                 where k2.patient_id = c.patient_id and k2.type = 'image_upload'
                 order by k2.created_at desc limit 1
              ), false)) end,
    l.sent_at,
    case when l.status <> 'withdrawn' then l.seen_at end,
    l.withdrawn_at,
    case when l.status <> 'withdrawn' then
      (select count(*)::integer from public.messages m
        where m.lead_id = l.id and m.sender_role = 'patient' and m.read_at is null) end
  from public.leads l
  join public.clinics k on k.id = l.clinic_id and k.owner_id = (select auth.uid()) and k.status = 'verified'
    and l.sent_at >= k.owner_since
  join public.cases c on c.id = l.case_id
  left join public.postal_codes pc on pc.postal_code = c.postal_code
  where p_status is null or l.status = p_status
  order by (l.status = 'sent') desc, c.is_emergency desc, l.sent_at desc;
$$;
