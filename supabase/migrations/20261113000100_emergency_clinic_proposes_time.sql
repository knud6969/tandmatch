-- Akutvejen vendes om (2026-11-13, leads 10.11): patienten vælger ikke længere en tid. Henvendelsen sendes uden tid, og klinikken
-- accepterer med en foreslået tid, som reserveres (held) til patienten bekræfter. Akutvinduer i åbningstiderne findes ikke længere.
--
--   * clinic_opening_hours.is_emergency bruges ikke mere: alle rækker sættes til false, og ingen funktion læser feltet
--     (kolonnen fjernes ved en senere oprydning, fordi de offentlige læsefunktioner stadig nævner den).
--   * leads.contact_name/contact_phone: patientens kontakt fra akutformularen. Kun patienten kan læse leads (RLS); klinikken
--     ser kontakten først, når tiden er booket (5.5), fordi den kun kommer ud via bookingen.
--   * send_leads() og send_emergency_lead() tager ingen tid. clinic_decide_lead() får p_proposed_starts_at (krævet ved accept af
--     et akut-lead, forbudt ellers). Leadet bliver `accepted` med en held-booking; confirm_held_booking() gør den til `booked`.
--   * book_slot(): vælger patienten en anden tid, frigives klinikkens forslag.
--   * notify_after_booking_change(): held -> booked giver de samme notifikationer som en ny booking.
--   * clinic_stats(): akut-leads tælles på requested_service_id.

update public.clinic_opening_hours set is_emergency = false where is_emergency;
comment on column public.clinic_opening_hours.is_emergency is 'Ubrugt siden 2026-11-13 (akutvinduer er fjernet). Altid false.';

alter table public.leads
  add column contact_name text null check (contact_name is null or char_length(btrim(contact_name)) between 2 and 100),
  add column contact_phone text null check (contact_phone is null or public.is_valid_phone(contact_phone));
-- requested_starts_at sættes ikke længere (patienten vælger ingen tid); kun ældre akut-leads har den.
alter table public.leads drop constraint leads_check2;
alter table public.leads add constraint leads_contact_only_emergency check (contact_name is null or requested_service_id is not null);
comment on column public.leads.requested_starts_at is 'Kun akut-leads fra før 2026-11-13 (patienten valgte selv tiden). Sættes ikke længere.';

-- Tidsrummet tjekkes mod åbningstider, blokeringer, varsel og horisont. Akutydelser må bruge alle åbningstider.
create or replace function public.assert_slot_bookable(
  p_clinic_id uuid, p_service_id uuid, p_starts_at timestamptz, p_ends_at timestamptz
)
returns void
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_emergency boolean;
  v_notice interval;
  v_local_start timestamp := p_starts_at at time zone 'Europe/Copenhagen';
  v_local_end timestamp := p_ends_at at time zone 'Europe/Copenhagen';
begin
  select (s.category = 'emergency') into v_emergency from public.services s where s.id = p_service_id and s.is_active;
  if v_emergency is null then
    raise exception 'INVALID_SERVICE' using errcode = '22023';
  end if;
  v_notice := case when v_emergency then interval '0 minutes' else interval '30 minutes' end;
  if extract(minute from v_local_start)::integer % 15 <> 0 or extract(second from v_local_start) <> 0 then
    raise exception 'SLOT_UNAVAILABLE' using errcode = 'P0001';
  end if;
  if p_starts_at < now() + v_notice or p_starts_at > now() + interval '60 days' then
    raise exception 'SLOT_UNAVAILABLE' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.clinic_opening_hours h
     where h.clinic_id = p_clinic_id
       and h.weekday = extract(isodow from v_local_start)::smallint
       and h.opens_at <= v_local_start::time
       and v_local_end::time <= h.closes_at
       and v_local_end::date = v_local_start::date
  ) then
    raise exception 'SLOT_UNAVAILABLE' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.clinic_time_blocks b
     where b.clinic_id = p_clinic_id and tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(p_starts_at, p_ends_at, '[)')
  ) then
    raise exception 'SLOT_UNAVAILABLE' using errcode = 'P0001';
  end if;
end;
$$;

-- send_leads(): eneste vej til at oprette leads (5.3). Akut (én klinik, en akutydelse og kontakt) uden tid: kontakten gemmes
-- på leadet, og klinikken foreslår tiden ved accept.
drop function public.send_emergency_lead(uuid, uuid, timestamptz, text, text, text, text);
drop function public.send_leads(uuid, uuid[], uuid, timestamptz, text, text);

create function public.send_leads(
  p_case_id uuid,
  p_clinic_ids uuid[],
  p_requested_service_id uuid default null,
  p_contact_name text default null,
  p_contact_phone text default null
)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_case public.cases%rowtype;
  v_ids uuid[];
  v_n integer;
  v_consent_id uuid;
  v_case_lat double precision;
  v_case_lng double precision;
  v_clinic public.clinics%rowtype;
  v_services integer;
  v_priced integer;
  v_pmin integer;
  v_pmax integer;
  v_akut boolean := p_requested_service_id is not null or p_contact_name is not null or p_contact_phone is not null;
begin
  if v_uid is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;
  if not public.is_permanent_user() then
    raise exception 'ACCOUNT_REQUIRED' using errcode = '42501';
  end if;
  select * into v_case from public.cases where id = p_case_id and patient_id = v_uid for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_case.status = 'closed' or v_case.summary_text is null or v_case.summary_approved_at is null
     or not exists (select 1 from public.case_services s where s.case_id = p_case_id) then
    raise exception 'CASE_NOT_READY' using errcode = 'P0001';
  end if;
  if not v_akut and v_case.preferred_timeframe is null then
    raise exception 'CASE_NOT_READY' using errcode = 'P0001';
  end if;
  if not public.has_active_consent('health_data_sharing') then
    raise exception 'CONSENT_REQUIRED' using errcode = '42501';
  end if;

  select array_agg(distinct i) into v_ids from unnest(coalesce(p_clinic_ids, '{}')) as i;
  v_n := coalesce(array_length(v_ids, 1), 0);
  if v_n = 0 or v_n <> coalesce(array_length(p_clinic_ids, 1), 0) then
    raise exception 'INVALID_CLINICS' using errcode = '22023';
  end if;
  if (select count(*) from public.clinics k where k.id = any (v_ids) and k.status = 'verified') <> v_n then
    raise exception 'CLINIC_NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.leads l where l.case_id = p_case_id and l.clinic_id = any (v_ids)) then
    raise exception 'CLINIC_ALREADY_CONTACTED' using errcode = 'P0001';
  end if;
  if (select count(*) from public.leads l where l.case_id = p_case_id and public.is_lead_active_status(l.status)) + v_n > 3 then
    raise exception 'LEAD_LIMIT' using errcode = 'P0001';
  end if;
  if (select count(*) from public.leads l where l.case_id = p_case_id) + v_n > 10 then
    raise exception 'LEAD_TOTAL_LIMIT' using errcode = 'P0001';
  end if;

  if v_akut then
    if v_n <> 1 or p_requested_service_id is null or p_contact_name is null or p_contact_phone is null then
      raise exception 'INVALID_EMERGENCY_REQUEST' using errcode = '22023';
    end if;
    if not exists (select 1 from public.services s where s.id = p_requested_service_id and s.category = 'emergency' and s.is_active)
       or not exists (select 1 from public.case_services cs where cs.case_id = p_case_id and cs.service_id = p_requested_service_id) then
      raise exception 'INVALID_SERVICE' using errcode = '22023';
    end if;
    if char_length(btrim(p_contact_name)) not between 2 and 100 or not public.is_valid_phone(p_contact_phone) then
      raise exception 'INVALID_CONTACT' using errcode = '22023';
    end if;
  end if;

  select pc.lat, pc.lng into v_case_lat, v_case_lng from public.postal_codes pc where pc.postal_code = v_case.postal_code;
  select count(*) into v_services from public.case_services where case_id = p_case_id;

  for v_clinic in select * from public.clinics where id = any (v_ids) order by id loop
    select count(*), sum(cp.price_min), sum(cp.price_max) into v_priced, v_pmin, v_pmax
      from public.case_services cs
      join public.clinic_prices cp on cp.service_id = cs.service_id and cp.clinic_id = v_clinic.id
     where cs.case_id = p_case_id;

    insert into public.leads (case_id, clinic_id, distance_km, list_price_min, list_price_max,
                              requested_service_id, contact_name, contact_phone)
    values (
      p_case_id, v_clinic.id,
      public.haversine_km(v_case_lat, v_case_lng, v_clinic.lat, v_clinic.lng),
      case when v_priced = v_services then v_pmin end,
      case when v_priced = v_services then v_pmax end,
      p_requested_service_id,
      case when v_akut then btrim(p_contact_name) end,
      case when v_akut then p_contact_phone end
    );
  end loop;

  if v_akut then
    update public.patients set phone = p_contact_phone where id = v_uid;
  end if;

  perform set_config('tm.system', 'on', true);
  if v_case.status = 'draft' then
    select c.id into v_consent_id from public.consents c
     where c.patient_id = v_uid and c.type = 'health_data_sharing' and c.withdrawn_at is null
     order by c.created_at desc limit 1;
    update public.cases
       set status = 'submitted', submitted_at = now(), sharing_consent_id = v_consent_id
     where id = p_case_id;
  end if;
  perform set_config('tm.system', '', true);
  update public.ai_conversations set status = 'closed' where case_id = p_case_id and status = 'active';
  return v_n;
end;
$$;

-- Akutvejen i én transaktion (10.11): sag (is_emergency, godkendt beskrivelse), akutydelsen og leadet til én klinik.
create function public.send_emergency_lead(
  p_clinic_id uuid,
  p_service_id uuid,
  p_description text,
  p_contact_name text,
  p_contact_phone text,
  p_postal_code text default null
)
returns table (case_id uuid, lead_id uuid)
language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := (select auth.uid());
  v_postal text;
  v_description text := btrim(coalesce(p_description, ''));
  v_case_id uuid;
  v_lead_id uuid;
begin
  if v_uid is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;
  if not public.is_permanent_user() then
    raise exception 'ACCOUNT_REQUIRED' using errcode = '42501';
  end if;
  if p_clinic_id is null or p_service_id is null then
    raise exception 'INVALID_INPUT' using errcode = '22023';
  end if;
  if not exists (select 1 from public.services s where s.id = p_service_id and s.category = 'emergency' and s.is_active) then
    raise exception 'INVALID_SERVICE' using errcode = '22023';
  end if;
  if char_length(v_description) not between 10 and 1000 then
    raise exception 'INVALID_INPUT' using errcode = '22023';
  end if;
  if p_contact_name is null or char_length(btrim(p_contact_name)) not between 2 and 100
     or p_contact_phone is null or not public.is_valid_phone(p_contact_phone) then
    raise exception 'INVALID_CONTACT' using errcode = '22023';
  end if;
  v_postal := coalesce(nullif(btrim(p_postal_code), ''), (select p.postal_code from public.patients p where p.id = v_uid));
  if v_postal is not null and not exists (select 1 from public.postal_codes pc where pc.postal_code = v_postal) then
    raise exception 'UNKNOWN_POSTAL_CODE' using errcode = '22023';
  end if;

  perform set_config('tm.system', 'on', true);
  insert into public.cases (patient_id, is_emergency, postal_code, preferred_timeframe, summary_text,
                            summary_ai_assisted, summary_approved_at)
  values (v_uid, true, v_postal, null, v_description, false, now())
  returning id into v_case_id;
  perform set_config('tm.system', '', true);

  insert into public.case_services (case_id, service_id, suggested_by_ai) values (v_case_id, p_service_id, false);

  perform public.send_leads(v_case_id, array[p_clinic_id], p_service_id, p_contact_name, p_contact_phone);

  select l.id into v_lead_id from public.leads l where l.case_id = v_case_id and l.clinic_id = p_clinic_id;
  return query select v_case_id, v_lead_id;
end;
$$;

-- clinic_decide_lead(): kun fra 'sent'. Et akut-lead accepteres med en foreslået tid, som reserveres til patienten
-- (EMERGENCY_HOLD_MINUTES = 30, dog højst til starttid). Leadet bliver 'accepted'; confirm_held_booking() gør det 'booked'.
drop function public.clinic_decide_lead(uuid, text, text, integer, integer, public.lead_decline_reason, text);

create function public.clinic_decide_lead(
  p_lead_id uuid,
  p_decision text,
  p_comment text default null,
  p_quoted_min integer default null,
  p_quoted_max integer default null,
  p_decline_reason public.lead_decline_reason default null,
  p_decline_note text default null,
  p_proposed_starts_at timestamptz default null
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_lead public.leads%rowtype;
  v_clinic public.clinics%rowtype;
  v_patient uuid;
  v_email text;
  v_ends timestamptz;
begin
  if v_uid is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;
  if p_decision not in ('accept', 'decline') then
    raise exception 'INVALID_DECISION' using errcode = '22023';
  end if;
  select l.* into v_lead from public.leads l
    join public.clinics k on k.id = l.clinic_id
   where l.id = p_lead_id and k.owner_id = v_uid and l.sent_at >= k.owner_since
   for update of l;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  select * into v_clinic from public.clinics where id = v_lead.clinic_id;
  if v_clinic.status <> 'verified' then
    raise exception 'CLINIC_NOT_VERIFIED' using errcode = '42501';
  end if;
  if v_lead.status <> 'sent' then
    raise exception 'LEAD_NOT_PENDING' using errcode = 'P0001';
  end if;
  perform public.release_expired_holds(v_lead.clinic_id);

  if p_decision = 'accept' then
    if p_comment is not null and char_length(p_comment) > 500 then
      raise exception 'INVALID_COMMENT' using errcode = '22023';
    end if;
    if (p_quoted_min is null) <> (p_quoted_max is null) or (p_quoted_min is not null and (p_quoted_min < 0 or p_quoted_max < p_quoted_min)) then
      raise exception 'INVALID_PRICE' using errcode = '22023';
    end if;
    -- Et akut-lead kræver en foreslået tid; et almindeligt lead må ikke have en (patienten booker selv).
    if (v_lead.requested_service_id is not null) <> (p_proposed_starts_at is not null) then
      raise exception 'PROPOSED_TIME_REQUIRED' using errcode = '22023';
    end if;
    if p_proposed_starts_at is not null then
      v_ends := p_proposed_starts_at + make_interval(mins => public.service_duration_min(v_lead.clinic_id, v_lead.requested_service_id));
      perform public.assert_slot_bookable(v_lead.clinic_id, v_lead.requested_service_id, p_proposed_starts_at, v_ends);
      select c.patient_id into v_patient from public.cases c where c.id = v_lead.case_id;
      select u.email into v_email from auth.users u where u.id = v_patient;
      begin
        insert into public.bookings (lead_id, clinic_id, patient_id, service_id, starts_at, ends_at, status,
                                     hold_expires_at, contact_name, contact_phone, contact_email)
        values (p_lead_id, v_lead.clinic_id, v_patient, v_lead.requested_service_id, p_proposed_starts_at, v_ends, 'held',
                least(now() + interval '30 minutes', p_proposed_starts_at),
                v_lead.contact_name, v_lead.contact_phone, coalesce(v_email, ''));
      exception when exclusion_violation then
        raise exception 'SLOT_TAKEN' using errcode = 'P0001';
      end;
    end if;
    update public.leads
       set status = 'accepted',
           clinic_comment = nullif(btrim(p_comment), ''), quoted_price_min = p_quoted_min, quoted_price_max = p_quoted_max,
           responded_at = now(), seen_at = coalesce(seen_at, now())
     where id = p_lead_id;
  else
    if p_decline_reason is null then
      raise exception 'DECLINE_REASON_REQUIRED' using errcode = '22023';
    end if;
    if p_decline_reason = 'clinic_left' then
      raise exception 'INVALID_DECLINE_REASON' using errcode = '22023';
    end if;
    if p_decline_note is not null and char_length(p_decline_note) > 200 then
      raise exception 'INVALID_COMMENT' using errcode = '22023';
    end if;
    update public.leads
       set status = 'declined', decline_reason = p_decline_reason, decline_note = nullif(btrim(p_decline_note), ''),
           responded_at = now(), seen_at = coalesce(seen_at, now())
     where id = p_lead_id;
  end if;
end;
$$;

-- confirm_held_booking(): patienten bekræfter klinikkens foreslåede akuttid, mens reservationen gælder.
create function public.confirm_held_booking(p_booking_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_booking public.bookings%rowtype;
begin
  if v_uid is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;
  if not public.is_permanent_user() then
    raise exception 'ACCOUNT_REQUIRED' using errcode = '42501';
  end if;
  select * into v_booking from public.bookings where id = p_booking_id and patient_id = v_uid for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_booking.status <> 'held' or v_booking.hold_expires_at <= now() then
    raise exception 'HOLD_EXPIRED' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.clinics k where k.id = v_booking.clinic_id and k.status = 'verified') then
    raise exception 'CLINIC_NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  update public.bookings set status = 'booked', hold_expires_at = null where id = p_booking_id;
  update public.leads set status = 'booked' where id = v_booking.lead_id and status = 'accepted';
end;
$$;

-- book_slot(): som før, men vælger patienten en anden tid end klinikkens forslag, frigives forslaget først.
create or replace function public.book_slot(
  p_lead_id uuid, p_service_id uuid, p_starts_at timestamptz, p_contact_name text, p_contact_phone text
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_lead public.leads%rowtype;
  v_clinic public.clinics%rowtype;
  v_duration integer;
  v_ends timestamptz;
  v_email text;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;
  if not public.is_permanent_user() then
    raise exception 'ACCOUNT_REQUIRED' using errcode = '42501';
  end if;
  select l.* into v_lead from public.leads l
    join public.cases c on c.id = l.case_id
   where l.id = p_lead_id and c.patient_id = v_uid
   for update of l;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_lead.status <> 'accepted' then
    raise exception 'LEAD_NOT_ACCEPTED' using errcode = 'P0001';
  end if;
  select * into v_clinic from public.clinics where id = v_lead.clinic_id;
  if v_clinic.status <> 'verified' then
    raise exception 'CLINIC_NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  -- Loft: højst 5 bookinger i alt pr. lead, uanset status, men ikke dem klinikken har aflyst. Leadet er låst ovenfor (for update), så samtidige kald tæller rigtigt.
  if (select count(*) from public.bookings b where b.lead_id = p_lead_id and b.cancelled_by is distinct from 'clinic') >= 5 then
    raise exception 'BOOKING_LIMIT' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.case_services cs where cs.case_id = v_lead.case_id and cs.service_id = p_service_id)
     and v_lead.requested_service_id is distinct from p_service_id then
    raise exception 'INVALID_SERVICE' using errcode = '22023';
  end if;
  if p_contact_name is null or char_length(btrim(p_contact_name)) not between 2 and 100
     or p_contact_phone is null or not public.is_valid_phone(p_contact_phone) then
    raise exception 'INVALID_CONTACT' using errcode = '22023';
  end if;

  perform public.release_expired_holds(v_lead.clinic_id);
  update public.bookings
     set status = 'cancelled', cancelled_by = 'patient', cancelled_at = now()
   where lead_id = p_lead_id and status = 'held';
  v_duration := public.service_duration_min(v_lead.clinic_id, p_service_id);
  v_ends := p_starts_at + make_interval(mins => v_duration);
  perform public.assert_slot_bookable(v_lead.clinic_id, p_service_id, p_starts_at, v_ends);
  select u.email into v_email from auth.users u where u.id = v_uid;
  begin
    insert into public.bookings (lead_id, clinic_id, patient_id, service_id, starts_at, ends_at, status,
                                 contact_name, contact_phone, contact_email)
    values (p_lead_id, v_lead.clinic_id, v_uid, p_service_id, p_starts_at, v_ends, 'booked',
            btrim(p_contact_name), p_contact_phone, coalesce(v_email, ''))
    returning id into v_id;
  exception when exclusion_violation then
    raise exception 'SLOT_TAKEN' using errcode = 'P0001';
  end;
  update public.patients set phone = p_contact_phone where id = v_uid;
  update public.leads set status = 'booked' where id = p_lead_id;
  return v_id;
end;
$$;

-- Notifikationer: held -> booked (patienten bekræfter klinikkens forslag) giver det samme som en ny booking.
create or replace function public.notify_after_booking_change()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_previous timestamptz;
begin
  begin
    if tg_op = 'INSERT' then
      -- En held-booking (klinikkens forslag) giver ingen række her; patienten får patient_lead_answered fra lead-triggeren.
      if new.status = 'booked' and new.rescheduled_from_id is null then
        perform public.notification_enqueue('clinic_booking_created', new.clinic_id, null, new.lead_id, new.id,
          jsonb_build_object('leadId', new.lead_id, 'bookingId', new.id, 'startsAt', public.notification_iso(new.starts_at)),
          'clinic_booking_created:' || new.id);
        perform public.notification_enqueue('patient_booking_created', null, new.patient_id, new.lead_id, new.id,
          jsonb_build_object('bookingId', new.id, 'startsAt', public.notification_iso(new.starts_at)),
          'patient_booking_created:' || new.id);
      elsif new.status = 'booked' then
        select o.starts_at into v_previous from public.bookings o where o.id = new.rescheduled_from_id;
        perform public.notification_enqueue('clinic_booking_rescheduled', new.clinic_id, null, new.lead_id, new.id,
          jsonb_build_object('leadId', new.lead_id, 'bookingId', new.id, 'startsAt', public.notification_iso(new.starts_at),
                             'previousStartsAt', public.notification_iso(v_previous)),
          'clinic_booking_rescheduled:' || new.id);
        perform public.notification_enqueue('patient_booking_rescheduled', null, new.patient_id, new.lead_id, new.id,
          jsonb_build_object('bookingId', new.id, 'startsAt', public.notification_iso(new.starts_at),
                             'previousStartsAt', public.notification_iso(v_previous)),
          'patient_booking_rescheduled:' || new.id);
      end if;
    elsif old.status = 'held' and new.status = 'booked' then
      perform public.notification_enqueue('clinic_booking_created', new.clinic_id, null, new.lead_id, new.id,
        jsonb_build_object('leadId', new.lead_id, 'bookingId', new.id, 'startsAt', public.notification_iso(new.starts_at)),
        'clinic_booking_created:' || new.id);
      perform public.notification_enqueue('patient_booking_created', null, new.patient_id, new.lead_id, new.id,
        jsonb_build_object('bookingId', new.id, 'startsAt', public.notification_iso(new.starts_at)),
        'patient_booking_created:' || new.id);
    elsif old.status = 'booked' and new.status = 'cancelled' then
      -- held -> cancelled giver ingen række (forslaget udløb, eller patienten valgte en anden tid).
      if new.cancelled_by = 'patient' then
        -- reschedule_booking() sætter tm.rescheduling; så kommer meddelelsen fra den nye booking.
        if coalesce(current_setting('tm.rescheduling', true), '') <> 'on' then
          perform public.notification_enqueue('clinic_booking_cancelled', new.clinic_id, null, new.lead_id, new.id,
            jsonb_build_object('leadId', new.lead_id, 'bookingId', new.id, 'startsAt', public.notification_iso(new.starts_at)),
            'clinic_booking_cancelled:' || new.id);
          perform public.notification_enqueue('patient_booking_cancelled_self', null, new.patient_id, new.lead_id, new.id,
            jsonb_build_object('bookingId', new.id, 'startsAt', public.notification_iso(new.starts_at)),
            'patient_booking_cancelled_self:' || new.id);
        end if;
      elsif new.cancelled_by = 'clinic' then
        perform public.notification_enqueue('patient_booking_cancelled', null, new.patient_id, new.lead_id, new.id,
          jsonb_build_object('bookingId', new.id),
          'patient_booking_cancelled:' || new.id);
      end if;
    end if;
  exception when others then
    raise warning 'notifikation kunne ikke lægges i outboxen (%)', sqlstate;
  end;
  return null;
end;
$$;

-- clinic_stats(): akut-leads tælles på akutydelsen (requested_service_id), ikke længere på en ønsket tid. Ellers uændret.
create or replace function public.clinic_stats(p_from timestamptz, p_to timestamptz)
returns table (
  leads_total integer,
  leads_pending integer,
  leads_accepted integer,
  leads_declined integer,
  leads_withdrawn_unanswered integer,
  leads_emergency integer,
  answered_within_24h integer,
  median_response_minutes double precision,
  leads_with_booking integer,
  bookings_upcoming integer,
  bookings_completed integer,
  bookings_no_show integer,
  bookings_cancelled_by_patient integer,
  bookings_cancelled_by_clinic integer
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_clinic public.clinics%rowtype;
begin
  select * into v_clinic from public.clinics k
   where k.owner_id = (select auth.uid()) and k.status = 'verified';
  if not found then
    raise exception 'CLINIC_NOT_VERIFIED' using errcode = 'P0001';
  end if;
  if p_from is null or p_to is null or p_from >= p_to or p_to - p_from > interval '366 days' then
    raise exception 'INVALID_INPUT' using errcode = '22023';
  end if;

  return query
  with own_leads as (
    select l.id, l.status, l.sent_at, l.responded_at, l.decline_reason, l.requested_service_id
      from public.leads l
     where l.clinic_id = v_clinic.id
       and l.sent_at >= v_clinic.owner_since
       and l.sent_at >= p_from and l.sent_at < p_to
  ), lead_stats as (
    select
      count(*)::integer as total,
      (count(*) filter (where status = 'sent'))::integer as pending,
      (count(*) filter (where responded_at is not null and decline_reason is null))::integer as accepted,
      (count(*) filter (where decline_reason is not null))::integer as declined,
      (count(*) filter (where status = 'withdrawn' and responded_at is null))::integer as withdrawn_unanswered,
      (count(*) filter (where requested_service_id is not null))::integer as emergency,
      (count(*) filter (where responded_at is not null and responded_at - sent_at <= interval '24 hours'))::integer as within_24h,
      (percentile_cont(0.5) within group (order by extract(epoch from (responded_at - sent_at)) / 60.0)
         filter (where responded_at is not null)) as median_minutes
      from own_leads
  ), lead_bookings as (
    select count(*)::integer as with_booking
      from own_leads ol
     where exists (
       select 1 from public.bookings b
        where b.lead_id = ol.id
          and public.effective_booking_status(b.status, b.ends_at, b.hold_expires_at) in ('booked', 'completed', 'no_show')
     )
  ), own_bookings as (
    select b.id, b.cancelled_by,
           public.effective_booking_status(b.status, b.ends_at, b.hold_expires_at) as eff_status,
           b.starts_at,
           (b.starts_at >= p_from and b.starts_at < p_to) as in_period,
           exists (select 1 from public.bookings n where n.rescheduled_from_id = b.id) as was_rescheduled
      from public.bookings b
      join public.leads l on l.id = b.lead_id
     where b.clinic_id = v_clinic.id
       and l.sent_at >= v_clinic.owner_since
       and ((b.starts_at >= p_from and b.starts_at < p_to) or b.starts_at > now())
  ), booking_stats as (
    -- Kommende tider tælles uanset perioden (perioden slutter nu, så ingen tid i den ligger i fremtiden); de øvrige
    -- tal tæller bookinger med starttid i perioden.
    select
      (count(*) filter (where eff_status = 'booked' and starts_at > now()))::integer as upcoming,
      (count(*) filter (where in_period and eff_status = 'completed'))::integer as completed,
      (count(*) filter (where in_period and eff_status = 'no_show'))::integer as no_show,
      (count(*) filter (where in_period and eff_status = 'cancelled' and cancelled_by = 'patient' and not was_rescheduled))::integer as by_patient,
      (count(*) filter (where in_period and eff_status = 'cancelled' and cancelled_by = 'clinic' and not was_rescheduled))::integer as by_clinic
      from own_bookings
  )
  select ls.total, ls.pending, ls.accepted, ls.declined, ls.withdrawn_unanswered, ls.emergency, ls.within_24h,
         ls.median_minutes, lb.with_booking, bs.upcoming, bs.completed, bs.no_show, bs.by_patient, bs.by_clinic
    from lead_stats ls, lead_bookings lb, booking_stats bs;
end;
$$;

-- Rettigheder
revoke all on function public.send_leads(uuid, uuid[], uuid, text, text) from public, anon;
grant execute on function public.send_leads(uuid, uuid[], uuid, text, text) to authenticated;
revoke all on function public.send_emergency_lead(uuid, uuid, text, text, text, text) from public, anon;
grant execute on function public.send_emergency_lead(uuid, uuid, text, text, text, text) to authenticated;
revoke all on function public.clinic_decide_lead(uuid, text, text, integer, integer, public.lead_decline_reason, text, timestamptz) from public, anon;
grant execute on function public.clinic_decide_lead(uuid, text, text, integer, integer, public.lead_decline_reason, text, timestamptz) to authenticated;
revoke all on function public.confirm_held_booking(uuid) from public, anon;
grant execute on function public.confirm_held_booking(uuid) to authenticated;
revoke all on function public.assert_slot_bookable(uuid, uuid, timestamptz, timestamptz) from public, anon, authenticated;
