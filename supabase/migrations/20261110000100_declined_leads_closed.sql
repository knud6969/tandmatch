-- Afviste leads og tilbagetrukket delingssamtykke (security-runde 2026-11-05, H2; features/leads/README.md 4.4, 5.5, 5.7).
--  * lead_content_open(lead_id): ét sted for reglen om, hvornår klinikken må se sagens indhold. Status sent/accepted/booked
--    og (booked eller patientens seneste health_data_sharing er aktivt). Afviste (også clinic_left) og tilbagetrukne leads er lukkede.
--  * clinic_leads() og clinic_lead_detail() får kolonnen content_open (droppes og oprettes igen, samme rettigheder). Indhold
--    (ydelser, opsummering, område, afstand, priser, ønsket tid, billedantal, ulæste) kræver content_open; klinikkens eget
--    svar (akutmarkering, seen_at, responded_at, kommentar, pris, afvisningsgrund) er metadata og vises, når leadet ikke er withdrawn.
--  * clinic_lead_images(), clinic_lead_messages(), clinic_lead_message_images(), clinic_mark_messages_read() og klinikdelen af
--    is_lead_participant() bruger lead_content_open() i stedet for status <> 'withdrawn'.
-- Ingen nye tabeller eller grants ud over funktionerne her.

create function public.lead_content_open(p_lead_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
      from public.leads l
      join public.cases c on c.id = l.case_id
     where l.id = p_lead_id
       and l.status in ('sent', 'accepted', 'booked')
       and (
         l.status = 'booked'
         or coalesce((
              select k.withdrawn_at is null
                from public.consents k
               where k.patient_id = c.patient_id and k.type = 'health_data_sharing'
               order by k.created_at desc limit 1
            ), false)
       )
  );
$$;

revoke all on function public.lead_content_open(uuid) from public, anon;
grant execute on function public.lead_content_open(uuid) to authenticated, service_role;

drop function public.clinic_leads(public.lead_status);

create function public.clinic_leads(p_status public.lead_status default null)
returns TABLE(lead_id uuid, status lead_status, is_emergency boolean, service_names text[], postal_code text, city text, distance_km numeric, preferred_timeframe case_timeframe, requested_starts_at timestamp with time zone, image_count integer, sent_at timestamp with time zone, seen_at timestamp with time zone, withdrawn_at timestamp with time zone, unread_messages integer, summary_excerpt text, list_price_min integer, list_price_max integer, hold_expires_at timestamp with time zone, content_open boolean)
language sql
stable security definer
set search_path = ''
as $$
  select
    l.id,
    l.status,
    case when l.status <> 'withdrawn' then c.is_emergency end,
    case when o.is_open then
      (select array_agg(s.name order by s.sort_order, s.name)
         from public.case_services cs join public.services s on s.id = cs.service_id
        where cs.case_id = c.id) end,
    case when o.is_open then c.postal_code end,
    case when o.is_open then pc.city end,
    case when o.is_open then l.distance_km end,
    case when o.is_open then c.preferred_timeframe end,
    case when o.is_open then l.requested_starts_at end,
    case when o.is_open then
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
    case when o.is_open then
      (select count(*)::integer from public.messages m
        where m.lead_id = l.id and m.sender_role = 'patient' and m.read_at is null) end,
    case when o.is_open then left(btrim(regexp_replace(c.summary_text, '\s+', ' ', 'g')), 121) end,
    case when o.is_open then l.list_price_min end,
    case when o.is_open then l.list_price_max end,
    case when b.eff_status = 'held' then b.hold_expires_at end,
    o.is_open
  from public.leads l
  join public.clinics k on k.id = l.clinic_id and k.owner_id = (select auth.uid()) and k.status = 'verified'
    and l.sent_at >= k.owner_since
  join public.cases c on c.id = l.case_id
  cross join lateral (select public.lead_content_open(l.id) as is_open) o
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

drop function public.clinic_lead_detail(uuid);

create function public.clinic_lead_detail(p_lead_id uuid)
returns TABLE(lead_id uuid, status lead_status, is_emergency boolean, services jsonb, summary_text text, summary_ai_assisted boolean, postal_code text, city text, distance_km numeric, preferred_timeframe case_timeframe, requested_service_id uuid, requested_starts_at timestamp with time zone, image_count integer, list_price_min integer, list_price_max integer, sent_at timestamp with time zone, seen_at timestamp with time zone, withdrawn_at timestamp with time zone, responded_at timestamp with time zone, clinic_comment text, quoted_price_min integer, quoted_price_max integer, decline_reason lead_decline_reason, decline_note text, booking_id uuid, booking_service_id uuid, booking_service_name text, booking_starts_at timestamp with time zone, booking_ends_at timestamp with time zone, booking_status booking_status, booking_hold_expires_at timestamp with time zone, contact_name text, contact_phone text, contact_email text, can_mark_no_show boolean, unread_messages integer, content_open boolean)
language sql
stable security definer
set search_path = ''
as $$
  select
    l.id,
    l.status,
    case when l.status <> 'withdrawn' then c.is_emergency end,
    case when o.is_open then
      (select coalesce(jsonb_agg(jsonb_build_object(
                'id', s.id, 'slug', s.slug, 'name', s.name, 'description', s.description, 'category', s.category
              ) order by s.sort_order, s.name), '[]'::jsonb)
         from public.case_services cs join public.services s on s.id = cs.service_id
        where cs.case_id = c.id) end,
    case when o.is_open then c.summary_text end,
    case when o.is_open then c.summary_ai_assisted end,
    case when o.is_open then c.postal_code end,
    case when o.is_open then pc.city end,
    case when o.is_open then l.distance_km end,
    case when o.is_open then c.preferred_timeframe end,
    case when o.is_open then l.requested_service_id end,
    case when o.is_open then l.requested_starts_at end,
    case when o.is_open then
      (select count(*)::integer from public.case_images i
        where i.case_id = c.id
          and c.status <> 'draft'
          and coalesce((
                select k2.withdrawn_at is null
                  from public.consents k2
                 where k2.patient_id = c.patient_id and k2.type = 'image_upload'
                 order by k2.created_at desc limit 1
              ), false)) end,
    case when o.is_open then l.list_price_min end,
    case when o.is_open then l.list_price_max end,
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
    case when o.is_open then
      (select count(*)::integer from public.messages m
        where m.lead_id = l.id and m.sender_role = 'patient' and m.read_at is null) else 0 end,
    o.is_open
  from public.leads l
  join public.clinics k on k.id = l.clinic_id and k.owner_id = (select auth.uid()) and k.status = 'verified'
    and l.sent_at >= k.owner_since
  join public.cases c on c.id = l.case_id
  cross join lateral (select public.lead_content_open(l.id) as is_open) o
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


revoke all on function public.clinic_leads(public.lead_status) from public, anon;
revoke all on function public.clinic_lead_detail(uuid) from public, anon;
grant execute on function public.clinic_leads(public.lead_status) to authenticated, service_role;
grant execute on function public.clinic_lead_detail(uuid) to authenticated, service_role;

-- Billeder: kun mens indholdet er åbent (ikke withdrawn, ikke declined, delingssamtykket aktivt eller leadet booked).
create or replace function public.clinic_lead_images(p_lead_id uuid)
returns table (image_id uuid, storage_path text, approved_description text, width integer, height integer)
language sql stable security definer set search_path = ''
as $$
  select i.id, i.storage_path,
         case when c.summary_approved_at is not null and i.ai_described_at is not null
                   and c.summary_approved_at >= i.ai_described_at
              then i.ai_description end,
         i.width, i.height
    from public.leads l
    join public.clinics k on k.id = l.clinic_id and k.owner_id = (select auth.uid()) and k.status = 'verified'
      and l.sent_at >= k.owner_since
    join public.cases c on c.id = l.case_id
    join public.case_images i on i.case_id = c.id
   where l.id = p_lead_id
     and public.lead_content_open(l.id)
     and c.status <> 'draft'
     and coalesce((
           select k2.withdrawn_at is null
             from public.consents k2
            where k2.patient_id = c.patient_id and k2.type = 'image_upload'
            order by k2.created_at desc limit 1
         ), false)
   order by i.created_at;
$$;

create or replace function public.clinic_lead_messages(p_lead_id uuid)
returns table (id uuid, body text, created_at timestamptz, read_at timestamptz, from_me boolean)
language sql stable security definer set search_path = ''
as $$
  select m.id, m.body, m.created_at, m.read_at, m.sender_role = 'clinic'
    from public.messages m
   where m.lead_id = p_lead_id
     and public.lead_content_open(p_lead_id)
     and public.is_my_clinic_lead(p_lead_id)
   order by m.created_at, m.id;
$$;

create or replace function public.clinic_lead_message_images(p_lead_id uuid)
returns table (id uuid, message_id uuid, "position" smallint, storage_path text, width integer, height integer)
language sql stable security definer set search_path = ''
as $$
  select i.id, i.message_id, i.position, i.storage_path, i.width, i.height
    from public.message_images i
   where i.lead_id = p_lead_id
     and public.lead_content_open(p_lead_id)
     and public.is_my_clinic_lead(p_lead_id)
   order by i.created_at, i.message_id, i.position;
$$;

create or replace function public.clinic_mark_messages_read(p_lead_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_my_clinic_lead(p_lead_id) or not public.lead_content_open(p_lead_id) then
    return;
  end if;
  update public.messages m
     set read_at = now()
   where m.lead_id = p_lead_id and m.sender_role = 'patient' and m.read_at is null;
end;
$$;

-- Deltager i tråden: patienten på sagen, eller klinikken bag leadet, mens indholdet er åbent for klinikken.
create or replace function public.is_lead_participant(p_lead_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
      from public.leads l
      join public.cases c on c.id = l.case_id
      join public.clinics k on k.id = l.clinic_id
     where l.id = p_lead_id
       and (c.patient_id = (select auth.uid())
            or (public.lead_content_open(l.id) and k.owner_id = (select auth.uid()) and k.status = 'verified'
                and l.sent_at >= k.owner_since))
  );
$$;

-- create or replace bevarer grants; de gentages, så filen kan læses alene.
revoke all on function public.clinic_lead_images(uuid), public.clinic_lead_messages(uuid), public.clinic_lead_message_images(uuid),
  public.clinic_mark_messages_read(uuid), public.is_lead_participant(uuid) from public, anon;
grant execute on function public.clinic_lead_images(uuid), public.clinic_lead_messages(uuid), public.clinic_lead_message_images(uuid),
  public.clinic_mark_messages_read(uuid), public.is_lead_participant(uuid) to authenticated, service_role;
