-- Telefon med mindst 8 cifre og bookingloft uden klinikkens aflysninger (arbejdsplan 7.1; security kompromis 20 og 23; architecture 4.3, 5.3, 5.6, 7.6, 11).
-- 1) is_valid_phone(): samme regel som phoneSchema i API'et: tegnene ^[+0-9 ()-]{6,20}$ og mindst 8 cifre (MIN_PHONE_DIGITS).
-- 2) patients.phone er kun et forslag: ugyldige værdier sættes til null, derefter erstattes check constraint.
--    clinics.phone og bookings.contact_phone får den nye constraint som "not valid" (nye og ændrede rækker tjekkes straks)
--    og valideres i en do-blok; fejler valideringen (gamle rækker), bliver constraint stående som not valid, og der skrives en notice.
-- 3) book_slot(): kopi af 20261027000100 med is_valid_phone() og et BOOKING_LIMIT, der ikke tæller cancelled_by = 'clinic'.
--    Udløbne reservationer (cancelled_by null) og patientens aflysninger tæller stadig.

create or replace function public.is_valid_phone(p_phone text)
returns boolean
language sql immutable set search_path = ''
as $$
  select p_phone is not null
     and p_phone ~ '^[+0-9 ()-]{6,20}$'
     and char_length(regexp_replace(p_phone, '[^0-9]', '', 'g')) >= 8;
$$;

revoke all on function public.is_valid_phone(text) from public, anon;
grant execute on function public.is_valid_phone(text) to authenticated;

-- patients
update public.patients set phone = null where phone is not null and not public.is_valid_phone(phone);
alter table public.patients drop constraint if exists patients_phone_check;
alter table public.patients add constraint patients_phone_check check (phone is null or public.is_valid_phone(phone));

-- clinics og bookings
alter table public.clinics drop constraint if exists clinics_phone_check;
alter table public.clinics add constraint clinics_phone_check
  check (phone is null or public.is_valid_phone(phone)) not valid;
alter table public.bookings drop constraint if exists bookings_contact_phone_check;
alter table public.bookings add constraint bookings_contact_phone_check
  check (public.is_valid_phone(contact_phone)) not valid;

do $$
begin
  begin
    alter table public.clinics validate constraint clinics_phone_check;
  exception when check_violation then
    raise notice 'clinics_phone_check er ikke valideret: gamle klinikker har telefonnumre under 8 cifre. Nye og ændrede rækker tjekkes.';
  end;
  begin
    alter table public.bookings validate constraint bookings_contact_phone_check;
  exception when check_violation then
    raise notice 'bookings_contact_phone_check er ikke valideret: gamle bookinger har telefonnumre under 8 cifre. Nye og ændrede rækker tjekkes.';
  end;
end;
$$;

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
