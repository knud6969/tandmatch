-- Loft på bookinger pr. lead (arbejdsplan 6.7a, security trin 6 M1, architecture 7.6).
-- En patient kunne book og aflyse i det uendelige på samme accepterede lead; hver booking er en række i bookings.
-- book_slot() afviser nu den 6. booking på samme lead (alle statusser tælles, også aflyste) med BOOKING_LIMIT.
-- Ellers uændret fra 20261012000800_bookings.sql: samme signatur, security definer, search_path = '' og alle tjek.
-- MAX_BOOKINGS_PER_LEAD = 5 spejles i lib/constants/bookings.ts.

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
  -- Loft: højst 5 bookinger i alt pr. lead, uanset status. Leadet er låst ovenfor (for update), så samtidige kald tæller rigtigt.
  if (select count(*) from public.bookings b where b.lead_id = p_lead_id) >= 5 then
    raise exception 'BOOKING_LIMIT' using errcode = 'P0001';
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


revoke all on function public.book_slot(uuid, uuid, timestamptz, text, text) from public, anon;
grant execute on function public.book_slot(uuid, uuid, timestamptz, text, text) to authenticated;
