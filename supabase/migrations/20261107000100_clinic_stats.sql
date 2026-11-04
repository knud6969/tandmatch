-- Klinikkens statistik (features/clinics/README.md 6.3 og 10.18; PR C, 2026-11-04).
-- clinic_stats(p_from, p_to) returnerer én række med tal for den kaldendes EGEN klinik (auth.uid() er ejer). Der er ingen
-- klinik-id som parameter, så en klinik aldrig kan bede om en andens tal. Kræver en verificeret klinik. Tæller kun leads
-- sendt efter at den nuværende ejer overtog klinikken (sent_at >= owner_since, platform 5.1 regel 16), og kun bookinger på
-- sådanne leads. Returnerer kun tal, aldrig id'er, navne eller indhold.
-- Bookingernes status er den effektive (effective_booking_status): 'held' og udløbne reservationer tælles ikke. bookings_upcoming tæller alle
-- kommende tider, også efter perioden (som slutter nu). En aflyst
-- booking, der er flyttet (en anden booking har rescheduled_from_id = dens id), tælles ikke som aflyst.

create function public.clinic_stats(p_from timestamptz, p_to timestamptz)
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
    select l.id, l.status, l.sent_at, l.responded_at, l.decline_reason, l.requested_starts_at
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
      (count(*) filter (where requested_starts_at is not null))::integer as emergency,
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

revoke all on function public.clinic_stats(timestamptz, timestamptz) from public, anon;
grant execute on function public.clinic_stats(timestamptz, timestamptz) to authenticated, service_role;
