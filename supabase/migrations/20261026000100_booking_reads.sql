-- Læsefunktioner til bookinger (arbejdsplan 6.1, architecture 5.3, 5.5, 10.10).
--  * patient_bookings(): patientens egne bookinger med klinikkens navn, adresse og by (patienten har ingen SELECT på clinics,
--    og en fjernet klinik skal stadig kunne vises) og om der allerede er en anmeldelse. Effektiv status (4.2).
--  * clinic_booking(): én af klinikkens egne bookinger, med samme regler for kontaktfelter som clinic_bookings() (5.5).
-- Begge er security definer med fast search_path og tjekker selv ejerskab via auth.uid().

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
  created_at timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select x.id, x.lead_id, x.clinic_id, k.name, k.address, k.city, x.service_id, s.name, x.starts_at, x.ends_at, x.eff_status,
         case when x.eff_status = 'held' then x.hold_expires_at end,
         exists (select 1 from public.reviews r where r.booking_id = x.id),
         x.created_at
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
  can_mark_no_show boolean
)
language sql stable security definer set search_path = ''
as $$
  select * from public.clinic_bookings('-infinity'::timestamptz, 'infinity'::timestamptz) c where c.booking_id = p_booking_id;
$$;

revoke all on function public.patient_bookings(uuid) from public, anon;
revoke all on function public.clinic_booking(uuid) from public, anon;
grant execute on function public.patient_bookings(uuid) to authenticated;
grant execute on function public.clinic_booking(uuid) to authenticated;
