-- Flyt tid (features/booking/README.md 4.3, 10.16; platform 14.4; PR B, 2026-11-04).
--  * bookings.rescheduled_from_id: sat på den nye booking; unik, så en booking kun flyttes én gang.
--  * reschedule_booking(p_booking_id, p_starts_at): patienten flytter en booket tid til en ny tid hos samme klinik og
--    samme behandling i én transaktion. Den gamle aflyses, den nye oprettes; fejler den nye, står den gamle uændret.
--  * clinic_bookings(), clinic_booking() og patient_bookings() returnerer også rescheduled_from_starts_at og
--    rescheduled_to_starts_at (droppes og oprettes igen, samme rettigheder; ingen kontaktfelter ændres).
--  * notify_after_booking_change() får grenen for rescheduled_from_id (clinic_booking_rescheduled).

alter table public.bookings
  add column rescheduled_from_id uuid null references public.bookings (id) on delete set null,
  add constraint bookings_rescheduled_from_unique unique (rescheduled_from_id),
  add constraint bookings_rescheduled_from_not_self check (rescheduled_from_id is null or rescheduled_from_id <> id);

create function public.reschedule_booking(p_booking_id uuid, p_starts_at timestamptz)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_old public.bookings%rowtype;
  v_clinic public.clinics%rowtype;
  v_duration integer;
  v_ends timestamptz;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;
  if not public.is_permanent_user() then
    raise exception 'ACCOUNT_REQUIRED' using errcode = '42501';
  end if;
  if p_starts_at is null then
    raise exception 'INVALID_INPUT' using errcode = '22023';
  end if;
  select * into v_old from public.bookings b where b.id = p_booking_id and b.patient_id = v_uid for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  -- Samme frist som aflysning: kun 'booked' (effektivt) og før starttid.
  if public.effective_booking_status(v_old.status, v_old.ends_at, v_old.hold_expires_at) <> 'booked'
     or v_old.starts_at <= now() then
    raise exception 'BOOKING_NOT_RESCHEDULABLE' using errcode = 'P0001';
  end if;
  if p_starts_at = v_old.starts_at then
    raise exception 'SAME_SLOT' using errcode = '22023';
  end if;
  select * into v_clinic from public.clinics c where c.id = v_old.clinic_id;
  if v_clinic.status <> 'verified'
     or not exists (select 1 from public.leads l where l.id = v_old.lead_id and l.sent_at >= v_clinic.owner_since) then
    raise exception 'CLINIC_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  perform public.release_expired_holds(v_old.clinic_id);
  perform set_config('tm.rescheduling', 'on', true);

  begin
    update public.bookings
       set status = 'cancelled', cancelled_by = 'patient', cancelled_at = now()
     where id = p_booking_id;

    v_duration := public.service_duration_min(v_old.clinic_id, v_old.service_id);
    v_ends := p_starts_at + make_interval(mins => v_duration);
    perform public.assert_slot_bookable(v_old.clinic_id, v_old.service_id, p_starts_at, v_ends);
    -- Loft som i book_slot(): bookinger aflyst af klinikken tæller ikke; den gamle tid tæller nu som en patientaflysning.
    if (select count(*) from public.bookings b where b.lead_id = v_old.lead_id and b.cancelled_by is distinct from 'clinic') >= 5 then
      raise exception 'BOOKING_LIMIT' using errcode = 'P0001';
    end if;

    insert into public.bookings (lead_id, clinic_id, patient_id, service_id, starts_at, ends_at, status,
                                 contact_name, contact_phone, contact_email, rescheduled_from_id)
    values (v_old.lead_id, v_old.clinic_id, v_old.patient_id, v_old.service_id, p_starts_at, v_ends, 'booked',
            v_old.contact_name, v_old.contact_phone, v_old.contact_email, v_old.id)
    returning id into v_id;
  exception
    when exclusion_violation then
      perform set_config('tm.rescheduling', 'off', true);
      raise exception 'SLOT_TAKEN' using errcode = 'P0001';
    when others then
      perform set_config('tm.rescheduling', 'off', true);
      raise;
  end;
  perform set_config('tm.rescheduling', 'off', true);
  -- Leadet er stadig 'booked'.
  return v_id;
end;
$$;

revoke all on function public.reschedule_booking(uuid, timestamptz) from public, anon;
grant execute on function public.reschedule_booking(uuid, timestamptz) to authenticated;

-- Notifikationstriggeren (platform 14.4): ny gren for en flyttet booking; en flytning giver ingen aflysning.
create or replace function public.notify_after_booking_change()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_previous timestamptz;
begin
  begin
    if tg_op = 'INSERT' then
      -- En held-booking (akut) giver ingen række her; klinikken har allerede clinic_new_lead.
      if new.status = 'booked' and new.rescheduled_from_id is null then
        perform public.notification_enqueue('clinic_booking_created', new.clinic_id, null, new.lead_id, new.id,
          jsonb_build_object('leadId', new.lead_id, 'bookingId', new.id, 'startsAt', public.notification_iso(new.starts_at)),
          'clinic_booking_created:' || new.id);
      elsif new.status = 'booked' then
        select o.starts_at into v_previous from public.bookings o where o.id = new.rescheduled_from_id;
        perform public.notification_enqueue('clinic_booking_rescheduled', new.clinic_id, null, new.lead_id, new.id,
          jsonb_build_object('leadId', new.lead_id, 'bookingId', new.id, 'startsAt', public.notification_iso(new.starts_at),
                             'previousStartsAt', public.notification_iso(v_previous)),
          'clinic_booking_rescheduled:' || new.id);
      end if;
    elsif old.status = 'booked' and new.status = 'cancelled' then
      -- held -> booked giver ingen række her (den kommer fra lead-triggeren); held -> cancelled heller ikke.
      if new.cancelled_by = 'patient' then
        -- reschedule_booking() sætter tm.rescheduling; så kommer meddelelsen fra den nye booking.
        if coalesce(current_setting('tm.rescheduling', true), '') <> 'on' then
          perform public.notification_enqueue('clinic_booking_cancelled', new.clinic_id, null, new.lead_id, new.id,
            jsonb_build_object('leadId', new.lead_id, 'bookingId', new.id, 'startsAt', public.notification_iso(new.starts_at)),
            'clinic_booking_cancelled:' || new.id);
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

drop function public.clinic_booking(uuid);
drop function public.clinic_bookings(timestamptz, timestamptz);
drop function public.patient_bookings(uuid);

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
  can_mark_no_show boolean,
  cancelled_by public.booking_actor,
  cancel_reason text,
  rescheduled_from_starts_at timestamptz,
  rescheduled_to_starts_at timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select x.id, x.lead_id, x.service_id, s.name, x.starts_at, x.ends_at, x.eff_status,
         case when x.eff_status = 'held' then x.hold_expires_at end,
         case when x.eff_status in ('booked', 'completed') then x.contact_name end,
         case when x.eff_status in ('booked', 'completed') then x.contact_phone end,
         case when x.eff_status in ('booked', 'completed') then x.contact_email end,
         x.eff_status = 'booked' and x.starts_at <= now() and now() < x.ends_at + interval '24 hours',
         case when x.eff_status = 'cancelled' then x.cancelled_by end,
         case when x.eff_status = 'cancelled' then x.cancel_reason end,
         (select o.starts_at from public.bookings o where o.id = x.rescheduled_from_id),
         (select n.starts_at from public.bookings n where n.rescheduled_from_id = x.id)
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

create function public.clinic_booking(p_booking_id uuid)
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
  can_mark_no_show boolean,
  cancelled_by public.booking_actor,
  cancel_reason text,
  rescheduled_from_starts_at timestamptz,
  rescheduled_to_starts_at timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select * from public.clinic_bookings('-infinity'::timestamptz, 'infinity'::timestamptz) c where c.booking_id = p_booking_id;
$$;

create function public.patient_bookings(p_booking_id uuid default null)
returns table (
  booking_id uuid,
  lead_id uuid,
  clinic_id uuid,
  clinic_name text,
  clinic_address text,
  clinic_city text,
  service_id uuid,
  service_name text,
  starts_at timestamptz,
  ends_at timestamptz,
  status public.booking_status,
  hold_expires_at timestamptz,
  reviewed boolean,
  created_at timestamptz,
  cancelled_by public.booking_actor,
  cancel_reason text,
  rescheduled_from_starts_at timestamptz,
  rescheduled_to_starts_at timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select x.id, x.lead_id, x.clinic_id, k.name, k.address, k.city, x.service_id, s.name, x.starts_at, x.ends_at, x.eff_status,
         case when x.eff_status = 'held' then x.hold_expires_at end,
         exists (select 1 from public.reviews r where r.booking_id = x.id),
         x.created_at,
         case when x.eff_status = 'cancelled' then x.cancelled_by end,
         case when x.eff_status = 'cancelled' then x.cancel_reason end,
         (select o.starts_at from public.bookings o where o.id = x.rescheduled_from_id),
         (select n.starts_at from public.bookings n where n.rescheduled_from_id = x.id)
    from (
      select b.*, public.effective_booking_status(b.status, b.ends_at, b.hold_expires_at) as eff_status
        from public.bookings b
       where b.patient_id = (select auth.uid())
         and (p_booking_id is null or b.id = p_booking_id)
    ) x
    join public.clinics k on k.id = x.clinic_id
    join public.services s on s.id = x.service_id
   order by x.starts_at desc, x.id;
$$;

revoke all on function public.clinic_bookings(timestamptz, timestamptz) from public, anon;
revoke all on function public.clinic_booking(uuid) from public, anon;
revoke all on function public.patient_bookings(uuid) from public, anon;
grant execute on function public.clinic_bookings(timestamptz, timestamptz) to authenticated;
grant execute on function public.clinic_booking(uuid) to authenticated;
grant execute on function public.patient_bookings(uuid) to authenticated;
