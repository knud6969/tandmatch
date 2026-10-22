-- Del 11: læsefunktioner (architecture 5.3, 5.5, 5.7). De er den eneste læsevej for klinikker og for offentligheden.
-- Alle er security definer med tom search_path. Ingen funktion returnerer patient_id, owner_id eller cvr.
-- Leads med status 'withdrawn' returnerer kun id, status, sent_at og withdrawn_at (beslutning 20).
-- Kontaktfelter returneres kun, når bookingens EFFEKTIVE status er 'booked' eller 'completed' (aldrig 'held').

-- ---------------------------------------------------------------------------------------------------------
-- Klinikkens egne læsefunktioner
-- ---------------------------------------------------------------------------------------------------------

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
      (select count(*)::integer from public.case_images i where i.case_id = c.id) end,
    l.sent_at,
    case when l.status <> 'withdrawn' then l.seen_at end,
    l.withdrawn_at,
    case when l.status <> 'withdrawn' then
      (select count(*)::integer from public.messages m
        where m.lead_id = l.id and m.sender_id <> (select auth.uid()) and m.read_at is null) end
  from public.leads l
  join public.clinics k on k.id = l.clinic_id and k.owner_id = (select auth.uid()) and k.status = 'verified'
    and l.sent_at >= k.owner_since
  join public.cases c on c.id = l.case_id
  left join public.postal_codes pc on pc.postal_code = c.postal_code
  where p_status is null or l.status = p_status
  order by (l.status = 'sent') desc, c.is_emergency desc, l.sent_at desc;
$$;

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
  can_mark_no_show boolean
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
      b.eff_status = 'booked' and b.starts_at <= now() and now() < b.ends_at + interval '24 hours' end
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

-- Billeder til klinikken: kun for et ikke-tilbagetrukket lead og kun med patientens aktive image_upload-samtykke.
create function public.clinic_lead_images(p_lead_id uuid)
returns table (
  image_id uuid,
  storage_path text,
  approved_description text,
  width integer,
  height integer
)
language sql stable security definer set search_path = ''
as $$
  select i.id, i.storage_path, i.ai_description, i.width, i.height
    from public.leads l
    join public.clinics k on k.id = l.clinic_id and k.owner_id = (select auth.uid()) and k.status = 'verified'
      and l.sent_at >= k.owner_since
    join public.cases c on c.id = l.case_id
    join public.case_images i on i.case_id = c.id
   where l.id = p_lead_id
     and l.status <> 'withdrawn'
     and c.status <> 'draft'
     and coalesce((
           select k2.withdrawn_at is null
             from public.consents k2
            where k2.patient_id = c.patient_id and k2.type = 'image_upload'
            order by k2.created_at desc limit 1
         ), false)
   order by i.created_at;
$$;

-- Beskedtråd til klinikken. Aldrig sender_id (det er patientens id); kun om beskeden er klinikkens egen (H1).
create function public.clinic_lead_messages(p_lead_id uuid)
returns table (id uuid, body text, created_at timestamptz, read_at timestamptz, from_me boolean)
language sql stable security definer set search_path = ''
as $$
  select m.id, m.body, m.created_at, m.read_at, m.sender_id = (select auth.uid())
    from public.messages m
    join public.leads l on l.id = m.lead_id
   where m.lead_id = p_lead_id
     and l.status <> 'withdrawn'
     and public.is_my_clinic_lead(p_lead_id)
   order by m.created_at, m.id;
$$;

create function public.clinic_bookings(p_from timestamptz, p_to timestamptz)
returns table (
  booking_id uuid,
  lead_id uuid,
  service_id uuid,
  service_name text,
  starts_at timestamptz,
  ends_at timestamptz,
  status public.booking_status,
  hold_expires_at timestamptz,
  contact_name text,
  contact_phone text,
  contact_email text,
  can_mark_no_show boolean
)
language sql stable security definer set search_path = ''
as $$
  select x.id, x.lead_id, x.service_id, s.name, x.starts_at, x.ends_at, x.eff_status,
         case when x.eff_status = 'held' then x.hold_expires_at end,
         case when x.eff_status in ('booked', 'completed') then x.contact_name end,
         case when x.eff_status in ('booked', 'completed') then x.contact_phone end,
         case when x.eff_status in ('booked', 'completed') then x.contact_email end,
         x.eff_status = 'booked' and x.starts_at <= now() and now() < x.ends_at + interval '24 hours'
    from (
      select b.*, public.effective_booking_status(b.status, b.ends_at, b.hold_expires_at) as eff_status
        from public.bookings b
        join public.clinics k on k.id = b.clinic_id and k.owner_id = (select auth.uid()) and k.status = 'verified'
        join public.leads bl on bl.id = b.lead_id and bl.sent_at >= k.owner_since
       where b.ends_at > p_from and b.starts_at < p_to
    ) x
    join public.services s on s.id = x.service_id
   order by x.starts_at;
$$;

create function public.clinic_reviews()
returns table (
  review_id uuid,
  stars smallint,
  text text,
  price_accuracy public.price_accuracy,
  actual_price integer,
  lacked_transparency boolean,
  transparency_comment text,
  created_at timestamptz,
  reply_id uuid,
  reply_text text,
  reply_created_at timestamptz,
  reply_status public.moderation_status
)
language sql stable security definer set search_path = ''
as $$
  select r.id, r.stars, r.text, r.price_accuracy, r.actual_price, r.lacked_transparency, r.transparency_comment,
         r.created_at, rr.id, rr.text, rr.created_at, rr.moderation_status
    from public.reviews r
    join public.clinics k on k.id = r.clinic_id and k.owner_id = (select auth.uid()) and k.status = 'verified'
    join public.bookings rb on rb.id = r.booking_id
    join public.leads rl on rl.id = rb.lead_id and rl.sent_at >= k.owner_since
    left join public.review_replies rr on rr.review_id = r.id
   where r.moderation_status = 'approved'
   order by r.created_at desc;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Offentlige funktioner (også anon)
-- ---------------------------------------------------------------------------------------------------------

-- Basisdata for alle klinikker; fulde felter kun for verificerede. 'status' maskerer registered som imported
-- (en oprettet klinik ser ud som en importeret, [PROTOTYPE]). Ingen owner_id, ingen cvr.
create function public.public_clinics(p_service_ids uuid[] default null, p_clinic_ids uuid[] default null)
returns table (
  id uuid,
  name text,
  status public.clinic_status,
  address text,
  postal_code text,
  city text,
  lat double precision,
  lng double precision,
  phone text,
  website text,
  trustpilot_url text,
  trustpilot_score numeric,
  trustpilot_review_count integer,
  trustpilot_updated_at timestamptz,
  trustpilot_entered_by text,
  opening_hours jsonb,
  logo_path text,
  prices jsonb,
  has_emergency_hours boolean
)
language sql stable security definer set search_path = ''
as $$
  select
    k.id, k.name,
    case when k.status = 'verified' then 'verified'::public.clinic_status else 'imported'::public.clinic_status end,
    k.address, k.postal_code, k.city, k.lat, k.lng, k.phone, k.website,
    k.trustpilot_url, k.trustpilot_score, k.trustpilot_review_count, k.trustpilot_updated_at, k.trustpilot_entered_by,
    (select coalesce(jsonb_agg(jsonb_build_object(
              'weekday', h.weekday, 'opens_at', to_char(h.opens_at, 'HH24:MI'),
              'closes_at', to_char(h.closes_at, 'HH24:MI'), 'is_emergency', h.is_emergency
            ) order by h.weekday, h.opens_at), '[]'::jsonb)
       from public.clinic_opening_hours h where h.clinic_id = k.id),
    case when k.status = 'verified' then k.logo_path end,
    case when k.status = 'verified' then
      (select coalesce(jsonb_agg(jsonb_build_object(
                'service_id', s.id, 'service_slug', s.slug, 'service_name', s.name,
                'price_min', cp.price_min, 'price_max', cp.price_max,
                'duration_min', cp.duration_min, 'note', cp.note
              ) order by s.sort_order), '[]'::jsonb)
         from public.clinic_prices cp join public.services s on s.id = cp.service_id and s.is_active
        where cp.clinic_id = k.id and p_service_ids is not null and cp.service_id = any (p_service_ids)) end,
    case when k.status = 'verified' then
      exists (select 1 from public.clinic_opening_hours h where h.clinic_id = k.id and h.is_emergency) end
  from public.clinics k
  where (p_clinic_ids is null or k.id = any (p_clinic_ids))
  order by k.name;
$$;

create function public.public_clinic_profile(p_clinic_id uuid, p_service_ids uuid[] default null)
returns table (
  id uuid,
  name text,
  status public.clinic_status,
  address text,
  postal_code text,
  city text,
  lat double precision,
  lng double precision,
  phone text,
  website text,
  trustpilot_url text,
  trustpilot_score numeric,
  trustpilot_review_count integer,
  trustpilot_updated_at timestamptz,
  trustpilot_entered_by text,
  opening_hours jsonb,
  logo_path text,
  prices jsonb,
  has_emergency_hours boolean,
  description text,
  email text,
  all_prices jsonb,
  dentists jsonb
)
language sql stable security definer set search_path = ''
as $$
  select
    p.id, p.name, p.status, p.address, p.postal_code, p.city, p.lat, p.lng, p.phone, p.website,
    p.trustpilot_url, p.trustpilot_score, p.trustpilot_review_count, p.trustpilot_updated_at, p.trustpilot_entered_by,
    p.opening_hours, p.logo_path, p.prices, p.has_emergency_hours,
    case when p.status = 'verified' then k.description end,
    case when p.status = 'verified' then k.email end,
    case when p.status = 'verified' then
      (select coalesce(jsonb_agg(jsonb_build_object(
                'service_id', s.id, 'service_slug', s.slug, 'service_name', s.name,
                'price_min', cp.price_min, 'price_max', cp.price_max,
                'duration_min', cp.duration_min, 'note', cp.note
              ) order by s.sort_order), '[]'::jsonb)
         from public.clinic_prices cp join public.services s on s.id = cp.service_id and s.is_active
        where cp.clinic_id = k.id) end,
    case when p.status = 'verified' then
      (select coalesce(jsonb_agg(jsonb_build_object(
                'id', d.id, 'full_name', d.full_name, 'title', d.title, 'bio', d.bio, 'photo_path', d.photo_path,
                'portfolio', (select coalesce(jsonb_agg(jsonb_build_object(
                                        'id', pi.id, 'image_path', pi.image_path, 'caption', pi.caption,
                                        'service_name', ps.name
                                      ) order by pi.created_at), '[]'::jsonb)
                                from public.portfolio_items pi
                                left join public.services ps on ps.id = pi.service_id
                               where pi.dentist_id = d.id)
              ) order by d.sort_order, d.full_name), '[]'::jsonb)
         from public.clinic_dentists d where d.clinic_id = k.id) end
  from public.public_clinics(p_service_ids, array[p_clinic_id]) p
  join public.clinics k on k.id = p.id;
$$;

-- Optagede tidsrum for verificerede klinikker: ikke-udløbne reservationer, bookinger og blokeringer.
create function public.public_busy_intervals(p_clinic_ids uuid[], p_from timestamptz, p_to timestamptz)
returns table (clinic_id uuid, starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select b.clinic_id, b.starts_at, b.ends_at
    from public.bookings b
    join public.clinics k on k.id = b.clinic_id and k.status = 'verified'
   where b.clinic_id = any (p_clinic_ids)
     and b.ends_at > p_from and b.starts_at < p_to
     and public.effective_booking_status(b.status, b.ends_at, b.hold_expires_at) in ('held', 'booked', 'completed')
  union all
  select t.clinic_id, t.starts_at, t.ends_at
    from public.clinic_time_blocks t
    join public.clinics k on k.id = t.clinic_id and k.status = 'verified'
   where t.clinic_id = any (p_clinic_ids)
     and t.ends_at > p_from and t.starts_at < p_to;
$$;

-- Godkendte anmeldelser og godkendte svar, kun for verificerede klinikker. Anmelderen vises ikke.
create function public.public_reviews(p_clinic_id uuid)
returns table (
  review_id uuid,
  stars smallint,
  text text,
  price_accuracy public.price_accuracy,
  actual_price integer,
  lacked_transparency boolean,
  transparency_comment text,
  created_month timestamptz,
  reply_text text,
  reply_created_at timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select r.id, r.stars, r.text, r.price_accuracy, r.actual_price, r.lacked_transparency, r.transparency_comment,
         date_trunc('month', r.created_at), rr.text, rr.created_at
    from public.reviews r
    join public.clinics k on k.id = r.clinic_id and k.status = 'verified'
    left join public.review_replies rr on rr.review_id = r.id and rr.moderation_status = 'approved'
   where r.clinic_id = p_clinic_id and r.moderation_status = 'approved'
   order by r.created_at desc;
$$;

-- Rettigheder
revoke all on function public.clinic_leads(public.lead_status) from public, anon;
revoke all on function public.clinic_lead_detail(uuid) from public, anon;
revoke all on function public.clinic_lead_images(uuid) from public, anon;
revoke all on function public.clinic_bookings(timestamptz, timestamptz) from public, anon;
revoke all on function public.clinic_reviews() from public, anon;
revoke all on function public.clinic_lead_messages(uuid) from public, anon;
grant execute on function public.clinic_leads(public.lead_status) to authenticated;
grant execute on function public.clinic_lead_detail(uuid) to authenticated;
grant execute on function public.clinic_lead_images(uuid) to authenticated;
grant execute on function public.clinic_bookings(timestamptz, timestamptz) to authenticated;
grant execute on function public.clinic_reviews() to authenticated;
grant execute on function public.clinic_lead_messages(uuid) to authenticated;

revoke all on function public.public_clinics(uuid[], uuid[]) from public;
revoke all on function public.public_clinic_profile(uuid, uuid[]) from public;
revoke all on function public.public_busy_intervals(uuid[], timestamptz, timestamptz) from public;
revoke all on function public.public_reviews(uuid) from public;
grant execute on function public.public_clinics(uuid[], uuid[]) to anon, authenticated, service_role;
grant execute on function public.public_clinic_profile(uuid, uuid[]) to anon, authenticated, service_role;
grant execute on function public.public_busy_intervals(uuid[], timestamptz, timestamptz) to anon, authenticated, service_role;
grant execute on function public.public_reviews(uuid) to anon, authenticated, service_role;
