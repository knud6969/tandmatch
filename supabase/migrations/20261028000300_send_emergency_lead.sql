-- Trin 7.3: akutvejen i én transaktion (architecture 5.3, 10.11).
-- send_emergency_lead() opretter sagen (is_emergency, godkendt opsummering), bekræfter akutydelsen og kalder send_leads(),
-- som tjekker samtykke, verificeret klinik, lofter og tid og reserverer tiden (held). Fejler et led (fx SLOT_TAKEN),
-- rulles alt tilbage, så der ikke ligger en halv akutsag.
create function public.send_emergency_lead(
  p_clinic_id uuid,
  p_service_id uuid,
  p_starts_at timestamptz,
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
  if p_clinic_id is null or p_service_id is null or p_starts_at is null then
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

  perform public.send_leads(v_case_id, array[p_clinic_id], p_service_id, p_starts_at, p_contact_name, p_contact_phone);

  select l.id into v_lead_id from public.leads l where l.case_id = v_case_id and l.clinic_id = p_clinic_id;
  return query select v_case_id, v_lead_id;
end;
$$;

revoke all on function public.send_emergency_lead(uuid, uuid, timestamptz, text, text, text, text) from public, anon;
grant execute on function public.send_emergency_lead(uuid, uuid, timestamptz, text, text, text, text) to authenticated;
