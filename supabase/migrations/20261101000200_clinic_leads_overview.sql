-- Klinikkens indbakke som overblik (features/leads/README.md 5.7 og 10.9; features/clinics/README.md 6.3, 2026-10-24):
--   * summary_excerpt: de første 121 tegn af den godkendte opsummering med mellemrum og linjeskift samlet til ét mellemrum
--     (serveren afkorter til 120 med "…" og ser, om der blev skåret noget af).
--   * list_price_min/max: listepris-snapshot, som patienten så ved afsendelse.
--   * hold_expires_at: udløb for leadets reserverede akuttid ("Svar inden kl. HH:MM"), kun når den nyeste aktive booking har
--     effektiv status 'held'. Samme booking-valg som clinic_lead_detail() (20261025000100).
-- Alle tre er null for et tilbagetrukket lead. Ingen kontaktfelter. Adgangsreglen er uændret: ejer, verified og
-- sent_at >= owner_since. Returtypen ændres, så funktionen droppes og oprettes igen med samme rettigheder.

drop function public.clinic_leads(public.lead_status);

create function public.clinic_leads(p_status public.lead_status default null)
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
  unread_messages integer,
  summary_excerpt text,
  list_price_min integer,
  list_price_max integer,
  hold_expires_at timestamptz
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
        where m.lead_id = l.id and m.sender_role = 'patient' and m.read_at is null) end,
    case when l.status <> 'withdrawn' then left(btrim(regexp_replace(c.summary_text, '\s+', ' ', 'g')), 121) end,
    case when l.status <> 'withdrawn' then l.list_price_min end,
    case when l.status <> 'withdrawn' then l.list_price_max end,
    case when b.eff_status = 'held' then b.hold_expires_at end
  from public.leads l
  join public.clinics k on k.id = l.clinic_id and k.owner_id = (select auth.uid()) and k.status = 'verified'
    and l.sent_at >= k.owner_since
  join public.cases c on c.id = l.case_id
  left join public.postal_codes pc on pc.postal_code = c.postal_code
  left join lateral (
    select bk.hold_expires_at, public.effective_booking_status(bk.status, bk.ends_at, bk.hold_expires_at) as eff_status
      from public.bookings bk
     where bk.lead_id = l.id and l.status <> 'withdrawn'
     order by (public.effective_booking_status(bk.status, bk.ends_at, bk.hold_expires_at) in ('held', 'booked')) desc,
              bk.created_at desc
     limit 1
  ) b on true
  where p_status is null or l.status = p_status
  order by (l.status = 'sent') desc, (l.status <> 'withdrawn' and c.is_emergency) desc, l.sent_at desc;
$$;

revoke all on function public.clinic_leads(public.lead_status) from public, anon;
grant execute on function public.clinic_leads(public.lead_status) to authenticated;
