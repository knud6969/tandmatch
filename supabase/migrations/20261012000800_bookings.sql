-- Del 9: bookinger og lead-flowet (architecture 4.2, 4.3 bookings, 5.2, 5.3, 6.7).
-- Her ligger også send_leads(), clinic_decide_lead() og withdraw_lead(), fordi de opretter og ændrer held-bookinger.
--
-- Konstanter (skal ændres sammen med lib/constants/bookings.ts):
--   NO_SHOW_GRACE_HOURS = 24         fristen for udeblivelse efter sluttid (beslutning 16)
--   EMERGENCY_HOLD_MINUTES = 30      levetid for en reserveret akuttid (beslutning 18)
--   MIN_BOOKING_NOTICE_MIN = 30      varsel (akut: 0)
--   BOOKING_HORIZON_DAYS = 60

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  clinic_id uuid not null references public.clinics (id),
  patient_id uuid not null references public.patients (id) on delete cascade,
  service_id uuid not null references public.services (id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.booking_status not null default 'booked',
  hold_expires_at timestamptz null,
  contact_name text not null check (char_length(btrim(contact_name)) between 2 and 100),
  contact_phone text not null check (contact_phone ~ '^[+0-9 ()-]{6,20}$'),
  contact_email text not null check (char_length(contact_email) between 3 and 320),
  cancelled_by public.booking_actor null,
  cancelled_at timestamptz null,
  no_show_at timestamptz null,
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  check (starts_at < ends_at),
  check (status <> 'held' or hold_expires_at is not null),
  -- Ingen dobbeltbooking: også en reserveret akuttid blokerer. Én kalender pr. klinik [PROTOTYPE].
  constraint bookings_no_overlap exclude using gist (
    clinic_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status in ('held', 'booked', 'completed'))
);

create unique index bookings_one_active_per_lead on public.bookings (lead_id) where status in ('held', 'booked');
create index bookings_clinic_time_idx on public.bookings (clinic_id, starts_at);
create index bookings_patient_idx on public.bookings (patient_id, starts_at);

-- Effektiv status (4.2), ren funktion over rækkens felter.
create function public.effective_booking_status(
  p_status public.booking_status, p_ends_at timestamptz, p_hold_expires_at timestamptz
)
returns public.booking_status
language sql stable set search_path = ''
as $$
  select case
    when p_status = 'booked' and p_ends_at + interval '24 hours' <= now() then 'completed'::public.booking_status
    when p_status = 'held' and p_hold_expires_at <= now() then 'cancelled'::public.booking_status
    else p_status
  end;
$$;

create function public.booking_effective_status(p_booking_id uuid)
returns public.booking_status
language sql stable security definer set search_path = ''
as $$
  select public.effective_booking_status(b.status, b.ends_at, b.hold_expires_at)
    from public.bookings b where b.id = p_booking_id;
$$;

-- Udløbne reservationer frigives i samme transaktion som enhver skrivning (exclusion constraints kan ikke bruge now()).
create function public.release_expired_holds(p_clinic_id uuid)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_count integer;
begin
  with r as (
    update public.bookings
       set status = 'cancelled', cancelled_by = null, cancelled_at = hold_expires_at
     where clinic_id = p_clinic_id and status = 'held' and hold_expires_at <= now()
    returning 1
  )
  select count(*) into v_count from r;
  return v_count;
end;
$$;

-- Klinik og patient sættes fra leadet; identitet og tider er uforanderlige.
create function public.bookings_guard()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    select l.clinic_id, c.patient_id into new.clinic_id, new.patient_id
      from public.leads l join public.cases c on c.id = l.case_id
     where l.id = new.lead_id;
    if not found then
      raise exception 'NOT_FOUND' using errcode = 'P0002';
    end if;
    return new;
  end if;
  if new.id is distinct from old.id or new.lead_id is distinct from old.lead_id
     or new.clinic_id is distinct from old.clinic_id or new.patient_id is distinct from old.patient_id
     or new.service_id is distinct from old.service_id or new.starts_at is distinct from old.starts_at
     or new.ends_at is distinct from old.ends_at or new.contact_name is distinct from old.contact_name
     or new.contact_phone is distinct from old.contact_phone or new.contact_email is distinct from old.contact_email then
    raise exception 'Feltet kan ikke ændres' using errcode = '42501';
  end if;
  if old.status in ('completed', 'no_show', 'cancelled') and new.status is distinct from old.status then
    raise exception 'BOOKING_FINAL' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger bookings_guard
  before insert or update on public.bookings
  for each row execute function public.bookings_guard();

-- Intern: tjekker at et tidsrum kan bookes (åbningsvindue i lokal tid, blokeringer, varsel, horisont).
create function public.assert_slot_bookable(
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
       and (v_emergency or not h.is_emergency)
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

-- Intern: varighed for en ydelse hos en klinik (klinikkens duration_min, ellers katalogets standard).
create function public.service_duration_min(p_clinic_id uuid, p_service_id uuid)
returns integer
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select cp.duration_min from public.clinic_prices cp where cp.clinic_id = p_clinic_id and cp.service_id = p_service_id),
    (select s.default_duration_min from public.services s where s.id = p_service_id)
  )::integer;
$$;

-- Intern: haversine-afstand i km mellem to postnumre/koordinater.
create function public.haversine_km(p_lat1 double precision, p_lng1 double precision, p_lat2 double precision, p_lng2 double precision)
returns numeric
language sql immutable set search_path = ''
as $$
  select case when p_lat1 is null or p_lng1 is null or p_lat2 is null or p_lng2 is null then null
    else round((6371 * 2 * asin(sqrt(
      power(sin(radians(p_lat2 - p_lat1) / 2), 2)
      + cos(radians(p_lat1)) * cos(radians(p_lat2)) * power(sin(radians(p_lng2 - p_lng1) / 2), 2)
    )))::numeric, 1) end;
$$;

-- send_leads(): eneste vej til at oprette leads (5.3).
create function public.send_leads(
  p_case_id uuid,
  p_clinic_ids uuid[],
  p_requested_service_id uuid default null,
  p_requested_starts_at timestamptz default null,
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
  v_lead_id uuid;
  v_services integer;
  v_priced integer;
  v_pmin integer;
  v_pmax integer;
  v_akut boolean := p_requested_service_id is not null or p_requested_starts_at is not null
                    or p_contact_name is not null or p_contact_phone is not null;
  v_duration integer;
  v_ends timestamptz;
  v_email text;
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
    if v_n <> 1 or p_requested_service_id is null or p_requested_starts_at is null
       or p_contact_name is null or p_contact_phone is null then
      raise exception 'INVALID_EMERGENCY_REQUEST' using errcode = '22023';
    end if;
    if not exists (select 1 from public.services s where s.id = p_requested_service_id and s.category = 'emergency' and s.is_active)
       or not exists (select 1 from public.case_services cs where cs.case_id = p_case_id and cs.service_id = p_requested_service_id) then
      raise exception 'INVALID_SERVICE' using errcode = '22023';
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
                              requested_service_id, requested_starts_at)
    values (
      p_case_id, v_clinic.id,
      public.haversine_km(v_case_lat, v_case_lng, v_clinic.lat, v_clinic.lng),
      case when v_priced = v_services then v_pmin end,
      case when v_priced = v_services then v_pmax end,
      p_requested_service_id, p_requested_starts_at
    ) returning id into v_lead_id;

    if v_akut then
      if char_length(btrim(p_contact_name)) not between 2 and 100 or p_contact_phone !~ '^[+0-9 ()-]{6,20}$' then
        raise exception 'INVALID_CONTACT' using errcode = '22023';
      end if;
      perform public.release_expired_holds(v_clinic.id);
      v_duration := public.service_duration_min(v_clinic.id, p_requested_service_id);
      v_ends := p_requested_starts_at + make_interval(mins => v_duration);
      perform public.assert_slot_bookable(v_clinic.id, p_requested_service_id, p_requested_starts_at, v_ends);
      select u.email into v_email from auth.users u where u.id = v_uid;
      begin
        insert into public.bookings (lead_id, clinic_id, patient_id, service_id, starts_at, ends_at, status,
                                     hold_expires_at, contact_name, contact_phone, contact_email)
        values (v_lead_id, v_clinic.id, v_uid, p_requested_service_id, p_requested_starts_at, v_ends, 'held',
                least(now() + interval '30 minutes', p_requested_starts_at),
                btrim(p_contact_name), p_contact_phone, coalesce(v_email, ''));
      exception when exclusion_violation then
        raise exception 'SLOT_TAKEN' using errcode = 'P0001';
      end;
      update public.patients set phone = p_contact_phone where id = v_uid;
    end if;
  end loop;

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

-- clinic_decide_lead(): kun fra 'sent'. Accept efter udløbet reservation giver 'accepted' uden booking (beslutning 18).
create function public.clinic_decide_lead(
  p_lead_id uuid,
  p_decision text,
  p_comment text default null,
  p_quoted_min integer default null,
  p_quoted_max integer default null,
  p_decline_reason public.lead_decline_reason default null,
  p_decline_note text default null
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_lead public.leads%rowtype;
  v_clinic public.clinics%rowtype;
  v_hold_id uuid;
begin
  if v_uid is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;
  if p_decision not in ('accept', 'decline') then
    raise exception 'INVALID_DECISION' using errcode = '22023';
  end if;
  select l.* into v_lead from public.leads l
    join public.clinics k on k.id = l.clinic_id
   where l.id = p_lead_id and k.owner_id = v_uid
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
    select b.id into v_hold_id from public.bookings b
     where b.lead_id = p_lead_id and b.status = 'held' and b.hold_expires_at > now() for update;
    if v_hold_id is not null then
      update public.bookings set status = 'booked', hold_expires_at = null where id = v_hold_id;
    end if;
    update public.leads
       set status = case when v_hold_id is not null then 'booked'::public.lead_status else 'accepted'::public.lead_status end,
           clinic_comment = nullif(btrim(p_comment), ''), quoted_price_min = p_quoted_min, quoted_price_max = p_quoted_max,
           responded_at = now(), seen_at = coalesce(seen_at, now())
     where id = p_lead_id;
  else
    if p_decline_reason is null then
      raise exception 'DECLINE_REASON_REQUIRED' using errcode = '22023';
    end if;
    if p_decline_note is not null and char_length(p_decline_note) > 200 then
      raise exception 'INVALID_COMMENT' using errcode = '22023';
    end if;
    update public.bookings
       set status = 'cancelled', cancelled_by = 'clinic', cancelled_at = now()
     where lead_id = p_lead_id and status = 'held';
    update public.leads
       set status = 'declined', decline_reason = p_decline_reason, decline_note = nullif(btrim(p_decline_note), ''),
           responded_at = now(), seen_at = coalesce(seen_at, now())
     where id = p_lead_id;
  end if;
end;
$$;

-- withdraw_lead(): patienten trækker et ubesvaret lead tilbage; en reserveret akuttid frigives.
create function public.withdraw_lead(p_lead_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_lead public.leads%rowtype;
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
  if v_lead.status <> 'sent' then
    raise exception 'LEAD_NOT_PENDING' using errcode = 'P0001';
  end if;
  update public.bookings
     set status = 'cancelled', cancelled_by = 'patient', cancelled_at = now()
   where lead_id = p_lead_id and status = 'held';
  update public.leads set status = 'withdrawn', withdrawn_at = now() where id = p_lead_id;
end;
$$;

-- book_slot(): patienten booker en ledig tid på et accepteret lead.
create function public.book_slot(
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
  if not exists (select 1 from public.case_services cs where cs.case_id = v_lead.case_id and cs.service_id = p_service_id)
     and v_lead.requested_service_id is distinct from p_service_id then
    raise exception 'INVALID_SERVICE' using errcode = '22023';
  end if;
  if p_contact_name is null or char_length(btrim(p_contact_name)) not between 2 and 100
     or p_contact_phone is null or p_contact_phone !~ '^[+0-9 ()-]{6,20}$' then
    raise exception 'INVALID_CONTACT' using errcode = '22023';
  end if;

  perform public.release_expired_holds(v_lead.clinic_id);
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

-- cancel_booking(): patient eller klinik (ejer), kun 'booked' og før starttid; leadet tilbage til 'accepted'.
create function public.cancel_booking(p_booking_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_booking public.bookings%rowtype;
  v_actor public.booking_actor;
begin
  if v_uid is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_booking.patient_id = v_uid and public.is_permanent_user() then
    v_actor := 'patient';
  elsif exists (select 1 from public.clinics k where k.id = v_booking.clinic_id and k.owner_id = v_uid) then
    v_actor := 'clinic';
  else
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if public.effective_booking_status(v_booking.status, v_booking.ends_at, v_booking.hold_expires_at) <> 'booked'
     or v_booking.starts_at <= now() then
    raise exception 'BOOKING_NOT_CANCELLABLE' using errcode = 'P0001';
  end if;
  update public.bookings set status = 'cancelled', cancelled_by = v_actor, cancelled_at = now() where id = p_booking_id;
  update public.leads set status = 'accepted' where id = v_booking.lead_id and status = 'booked';
end;
$$;

-- mark_booking_no_show(): klinikken, fra starttid til 24 timer efter sluttid (beslutning 16).
create function public.mark_booking_no_show(p_booking_id uuid)
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
  select b.* into v_booking from public.bookings b
    join public.clinics k on k.id = b.clinic_id
   where b.id = p_booking_id and k.owner_id = v_uid
   for update of b;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if public.effective_booking_status(v_booking.status, v_booking.ends_at, v_booking.hold_expires_at) <> 'booked'
     or v_booking.starts_at > now() or v_booking.ends_at + interval '24 hours' <= now() then
    raise exception 'NO_SHOW_WINDOW_CLOSED' using errcode = 'P0001';
  end if;
  update public.bookings set status = 'no_show', no_show_at = now() where id = p_booking_id;
end;
$$;

-- complete_due_bookings(): kun service role. Skriver den effektive status ned. Ingen auth.uid().
create function public.complete_due_bookings()
returns table (completed integer, released_holds integer)
language plpgsql security definer set search_path = ''
as $$
declare
  v_completed integer;
  v_released integer;
begin
  with c as (
    update public.bookings
       set status = 'completed', completed_at = ends_at + interval '24 hours'
     where status = 'booked' and ends_at + interval '24 hours' <= now()
    returning 1
  ) select count(*) into v_completed from c;
  with r as (
    update public.bookings
       set status = 'cancelled', cancelled_by = null, cancelled_at = hold_expires_at
     where status = 'held' and hold_expires_at <= now()
    returning 1
  ) select count(*) into v_released from r;
  return query select v_completed, v_released;
end;
$$;

-- Rettigheder
revoke all on function public.effective_booking_status(public.booking_status, timestamptz, timestamptz) from public, anon;
revoke all on function public.booking_effective_status(uuid) from public, anon;
grant execute on function public.effective_booking_status(public.booking_status, timestamptz, timestamptz) to authenticated, service_role;
grant execute on function public.booking_effective_status(uuid) to authenticated, service_role;

revoke all on function public.release_expired_holds(uuid) from public, anon, authenticated;
revoke all on function public.assert_slot_bookable(uuid, uuid, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.service_duration_min(uuid, uuid) from public, anon, authenticated;
revoke all on function public.haversine_km(double precision, double precision, double precision, double precision) from public, anon, authenticated;
revoke all on function public.bookings_guard() from public, anon, authenticated;

revoke all on function public.send_leads(uuid, uuid[], uuid, timestamptz, text, text) from public, anon;
revoke all on function public.clinic_decide_lead(uuid, text, text, integer, integer, public.lead_decline_reason, text) from public, anon;
revoke all on function public.withdraw_lead(uuid) from public, anon;
revoke all on function public.book_slot(uuid, uuid, timestamptz, text, text) from public, anon;
revoke all on function public.cancel_booking(uuid) from public, anon;
revoke all on function public.mark_booking_no_show(uuid) from public, anon;
grant execute on function public.send_leads(uuid, uuid[], uuid, timestamptz, text, text) to authenticated;
grant execute on function public.clinic_decide_lead(uuid, text, text, integer, integer, public.lead_decline_reason, text) to authenticated;
grant execute on function public.withdraw_lead(uuid) to authenticated;
grant execute on function public.book_slot(uuid, uuid, timestamptz, text, text) to authenticated;
grant execute on function public.cancel_booking(uuid) to authenticated;
grant execute on function public.mark_booking_no_show(uuid) to authenticated;

revoke all on function public.complete_due_bookings() from public, anon, authenticated;
grant execute on function public.complete_due_bookings() to service_role;

-- RLS: patienten læser egne bookinger. Klinikker har ingen SELECT; de læser via clinic_*-funktionerne (5.5).
alter table public.bookings enable row level security;
create policy bookings_select_own_patient on public.bookings
  for select to authenticated using (patient_id = (select auth.uid()));
revoke insert, update, delete, truncate on public.bookings from authenticated;
