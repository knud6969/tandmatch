-- Trin 5.5d (review 2 og security L2; architecture 5.7, 10.9).
--   * clinic_lead_detail() returnerer unread_messages (patientens ulæste beskeder; 0 for et tilbagetrukket lead).
--     Returtypen ændres, så funktionen droppes og oprettes igen med samme tjek og grants.
--   * clinic_leads() sorterer kun på is_emergency for leads, der ikke er trukket tilbage (ellers afslører sorteringen
--     akut-flaget for et tilbagetrukket lead, hvis felter ellers er skjult).

drop function public.clinic_lead_detail(uuid);

create function public.clinic_lead_detail(p_lead_id uuid)
returns table (
  lead_id uuid,
  status public.lead_status,
  is_emergency boolean,
  services jsonb,
  summary_text text,
  summary_ai_assisted boolean,
  postal_code text,
  city text,
  distance_km numeric,
  preferred_timeframe public.case_timeframe,
  requested_service_id uuid,
  requested_starts_at timestamptz,
  image_count integer,
  list_price_min integer,
  list_price_max integer,
  sent_at timestamptz,
  seen_at timestamptz,
  withdrawn_at timestamptz,
  responded_at timestamptz,
  clinic_comment text,
  quoted_price_min integer,
  quoted_price_max integer,
  decline_reason public.lead_decline_reason,
  decline_note text,
  booking_id uuid,
  booking_service_id uuid,
  booking_service_name text,
  booking_starts_at timestamptz,
  booking_ends_at timestamptz,
  booking_status public.booking_status,
  booking_hold_expires_at timestamptz,
  contact_name text,
  contact_phone text,
  contact_email text,
  can_mark_no_show boolean,
  unread_messages integer
)
language sql stable security definer set search_path = ''
as $$
  select
    l.id,
    l.status,
    case when l.status <> 'withdrawn' then c.is_emergency end,
    case when l.status <> 'withdrawn' then
      (select coalesce(jsonb_agg(jsonb_build_object(
                'id', s.id, 'slug', s.slug, 'name', s.name, 'description', s.description, 'category', s.category
              ) order by s.sort_order, s.name), '[]'::jsonb)
         from public.case_services cs join public.services s on s.id = cs.service_id
        where cs.case_id = c.id) end,
    case when l.status <> 'withdrawn' then c.summary_text end,
    case when l.status <> 'withdrawn' then c.summary_ai_assisted end,
    case when l.status <> 'withdrawn' then c.postal_code end,
    case when l.status <> 'withdrawn' then pc.city end,
    case when l.status <> 'withdrawn' then l.distance_km end,
    case when l.status <> 'withdrawn' then c.preferred_timeframe end,
    case when l.status <> 'withdrawn' then l.requested_service_id end,
    case when l.status <> 'withdrawn' then l.requested_starts_at end,
    case when l.status <> 'withdrawn' then
      (select count(*)::integer from public.case_images i where i.case_id = c.id) end,
    case when l.status <> 'withdrawn' then l.list_price_min end,
    case when l.status <> 'withdrawn' then l.list_price_max end,
    l.sent_at,
    case when l.status <> 'withdrawn' then l.seen_at end,
    l.withdrawn_at,
    case when l.status <> 'withdrawn' then l.responded_at end,
    case when l.status <> 'withdrawn' then l.clinic_comment end,
    case when l.status <> 'withdrawn' then l.quoted_price_min end,
    case when l.status <> 'withdrawn' then l.quoted_price_max end,
    case when l.status <> 'withdrawn' then l.decline_reason end,
    case when l.status <> 'withdrawn' then l.decline_note end,
    b.id,
    b.service_id,
    bs.name,
    b.starts_at,
    b.ends_at,
    b.eff_status,
    case when b.eff_status = 'held' then b.hold_expires_at end,
    case when b.eff_status in ('booked', 'completed') then b.contact_name end,
    case when b.eff_status in ('booked', 'completed') then b.contact_phone end,
    case when b.eff_status in ('booked', 'completed') then b.contact_email end,
    case when b.id is not null then
      b.eff_status = 'booked' and b.starts_at <= now() and now() < b.ends_at + interval '24 hours' end,
    case when l.status <> 'withdrawn' then
      (select count(*)::integer from public.messages m
        where m.lead_id = l.id and m.sender_role = 'patient' and m.read_at is null) else 0 end
  from public.leads l
  join public.clinics k on k.id = l.clinic_id and k.owner_id = (select auth.uid()) and k.status = 'verified'
    and l.sent_at >= k.owner_since
  join public.cases c on c.id = l.case_id
  left join public.postal_codes pc on pc.postal_code = c.postal_code
  left join lateral (
    select bk.*, public.effective_booking_status(bk.status, bk.ends_at, bk.hold_expires_at) as eff_status
      from public.bookings bk
     where bk.lead_id = l.id and l.status <> 'withdrawn'
     order by (public.effective_booking_status(bk.status, bk.ends_at, bk.hold_expires_at) in ('held', 'booked')) desc,
              bk.created_at desc
     limit 1
  ) b on true
  left join public.services bs on bs.id = b.service_id
  where l.id = p_lead_id;
$$;

revoke all on function public.clinic_lead_detail(uuid) from public, anon;
grant execute on function public.clinic_lead_detail(uuid) to authenticated, service_role;

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
  order by (l.status = 'sent') desc, (l.status <> 'withdrawn' and c.is_emergency) desc, l.sent_at desc;
$$;
