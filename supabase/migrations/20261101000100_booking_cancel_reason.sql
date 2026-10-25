-- Aflysninger synlige i kalenderen og i appen (features/booking/README.md 4.3, 10.10; 2026-10-24).
--  * bookings.cancel_reason: klinikkens valgfri korte grund ved aflysning (1-200 tegn). Kun cancel_booking() skriver den, og
--    kun når aktøren er klinikken. Klientroller har stadig ingen INSERT/UPDATE på bookings; patienten læser sin egen række
--    gennem den eksisterende SELECT-policy (bookings_select_own_patient).
--  * cancel_booking(p_booking_id, p_reason default null) erstatter én-parameter-versionen. Samme regler som før.
--  * clinic_bookings(), clinic_booking() og patient_bookings() returnerer også cancelled_by og cancel_reason. Returtypen
--    ændres, så funktionerne droppes og oprettes igen med samme krop, rettigheder og search_path. Ingen patientdata tilføjes.

alter table public.bookings
  add column cancel_reason text null
  constraint bookings_cancel_reason_length check (cancel_reason is null or char_length(cancel_reason) between 1 and 200);

-- En grund findes kun på en booking, klinikken har aflyst.
alter table public.bookings
  add constraint bookings_cancel_reason_only_clinic check (cancel_reason is null or (status = 'cancelled' and cancelled_by = 'clinic'));

drop function public.cancel_booking(uuid);

-- cancel_booking(): patient eller klinik (ejer), kun 'booked' og før starttid; leadet tilbage til 'accepted'. Klinikken kan
-- give en kort grund (trimmes; tom bliver null; over 200 tegn giver INVALID_REASON). En patient, der sender en grund, får
-- også INVALID_REASON (API'et afviser det allerede med 400).
create function public.cancel_booking(p_booking_id uuid, p_reason text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_booking public.bookings%rowtype;
  v_actor public.booking_actor;
  v_reason text := nullif(btrim(p_reason), '');
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
  elsif public.is_my_clinic_lead(v_booking.lead_id) then
    v_actor := 'clinic';
  else
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_reason is not null and (v_actor <> 'clinic' or char_length(v_reason) > 200) then
    raise exception 'INVALID_REASON' using errcode = '22023';
  end if;
  if public.effective_booking_status(v_booking.status, v_booking.ends_at, v_booking.hold_expires_at) <> 'booked'
     or v_booking.starts_at <= now() then
    raise exception 'BOOKING_NOT_CANCELLABLE' using errcode = 'P0001';
  end if;
  update public.bookings
     set status = 'cancelled', cancelled_by = v_actor, cancelled_at = now(), cancel_reason = v_reason
   where id = p_booking_id;
  update public.leads set status = 'accepted' where id = v_booking.lead_id and status = 'booked';
end;
$$;

revoke all on function public.cancel_booking(uuid, text) from public, anon;
grant execute on function public.cancel_booking(uuid, text) to authenticated;

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
  cancel_reason text
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
         case when x.eff_status = 'cancelled' then x.cancel_reason end
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
  cancel_reason text
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
  cancel_reason text
)
language sql stable security definer set search_path = ''
as $$
  select x.id, x.lead_id, x.clinic_id, k.name, k.address, k.city, x.service_id, s.name, x.starts_at, x.ends_at, x.eff_status,
         case when x.eff_status = 'held' then x.hold_expires_at end,
         exists (select 1 from public.reviews r where r.booking_id = x.id),
         x.created_at,
         case when x.eff_status = 'cancelled' then x.cancelled_by end,
         case when x.eff_status = 'cancelled' then x.cancel_reason end
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
