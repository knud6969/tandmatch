-- Klinikkens bekræftelse ved billeder i beskeder (security-runde 2026-11-05, M2; features/leads/README.md 4.3 og 10.12).
--  * message_images.clinic_consent_text_version og clinic_consent_confirmed_at: kun klinikkens billeder. En række uden
--    consent_id (klinikkens) skal have begge (check-constraint, gælder nye rækker). Erklæringen er klinikkens egen, ikke et patientsamtykke.
--  * send_message_with_images() får p_clinic_consent_version (default null) og afviser en klinik uden den (CONSENT_REQUIRED).
--    Den gamle funktion med fem parametre droppes (en ny parameter ændrer signaturen). Klinikken kan ikke skrive, når indholdet er lukket
--    for den (lead_content_open), og får da THREAD_CLOSED.

alter table public.message_images
  add column clinic_consent_text_version text null check (char_length(clinic_consent_text_version) between 1 and 80),
  add column clinic_consent_confirmed_at timestamptz null,
  add constraint message_images_clinic_consent check (
    consent_id is not null or (clinic_consent_text_version is not null and clinic_consent_confirmed_at is not null)
  ) not valid;

drop function public.send_message_with_images(uuid, uuid, uuid, text, jsonb);

create function public.send_message_with_images(
  p_user_id uuid,
  p_lead_id uuid,
  p_message_id uuid,
  p_body text,
  p_images jsonb,
  p_clinic_consent_version text default null
)
returns timestamptz
language plpgsql security definer set search_path = ''
as $$
declare
  v_lead public.leads%rowtype;
  v_is_patient boolean;
  v_is_clinic boolean;
  v_consent_id uuid := null;
  v_count integer;
  v_body text := coalesce(p_body, '');
  v_created timestamptz;
  v_image jsonb;
  v_position integer := 0;
begin
  if p_user_id is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;
  -- Én afsender ad gangen, så døgnlofterne ikke kan overskrides af samtidige kald.
  perform pg_advisory_xact_lock(hashtextextended('message_images:' || p_user_id::text, 0));

  if exists (select 1 from public.profiles p where p.id = p_user_id and p.is_anonymous) then
    raise exception 'ACCOUNT_REQUIRED' using errcode = '42501';
  end if;

  select * into v_lead from public.leads l where l.id = p_lead_id for share;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  v_is_patient := exists (select 1 from public.cases c where c.id = v_lead.case_id and c.patient_id = p_user_id);
  v_is_clinic := not v_is_patient and exists (
    select 1 from public.clinics k
     where k.id = v_lead.clinic_id and k.owner_id = p_user_id and k.status = 'verified'
       and v_lead.sent_at >= k.owner_since and v_lead.status <> 'withdrawn');
  if not v_is_patient and not v_is_clinic then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if not public.is_lead_active_status(v_lead.status) then
    raise exception 'THREAD_CLOSED' using errcode = 'P0001';
  end if;
  -- Klinikken skriver kun, mens den må se indholdet (ikke efter tilbagetrukket delingssamtykke uden booket tid).
  if v_is_clinic and not public.lead_content_open(p_lead_id) then
    raise exception 'THREAD_CLOSED' using errcode = 'P0001';
  end if;

  if jsonb_typeof(p_images) is distinct from 'array' then
    raise exception 'VALIDATION_ERROR' using errcode = '22023';
  end if;
  v_count := jsonb_array_length(p_images);
  if v_count < 1 or v_count > 3 then
    raise exception 'IMAGE_LIMIT' using errcode = '22023';
  end if;
  if char_length(btrim(v_body)) > 2000 then
    raise exception 'VALIDATION_ERROR' using errcode = '22023';
  end if;

  if (select count(*) from public.messages m
       where m.sender_id = p_user_id and m.created_at > now() - interval '1 day') >= 200 then
    raise exception 'MESSAGE_LIMIT' using errcode = 'P0001';
  end if;
  if (select count(*) from public.message_images i join public.messages m on m.id = i.message_id
       where m.sender_id = p_user_id and i.created_at > now() - interval '1 day') + v_count > 30 then
    raise exception 'MESSAGE_IMAGE_LIMIT' using errcode = 'P0001';
  end if;

  -- Patienten skal have det gældende image_upload-samtykke (seneste række, ikke trukket tilbage, version ikke pensioneret).
  if v_is_patient then
    select c.id into v_consent_id
      from public.consents c
      join public.consent_text_versions v on v.text_version = c.text_version
     where c.patient_id = p_user_id and c.type = 'image_upload'
       and c.withdrawn_at is null and v.retired_at is null
       and c.created_at = (select max(c2.created_at) from public.consents c2
                            where c2.patient_id = p_user_id and c2.type = 'image_upload')
     limit 1;
    if v_consent_id is null then
      raise exception 'CONSENT_REQUIRED' using errcode = '42501';
    end if;
  end if;

  -- Klinikken skal have bekræftet sin egen erklæring (M2). Versionen valideres af serveren; her kræves blot en værdi.
  if v_is_clinic and (p_clinic_consent_version is null or btrim(p_clinic_consent_version) = ''
                      or char_length(p_clinic_consent_version) > 80) then
    raise exception 'CONSENT_REQUIRED' using errcode = '42501';
  end if;

  insert into public.messages (id, lead_id, sender_id, body)
  values (p_message_id, p_lead_id, p_user_id, btrim(v_body))
  returning created_at into v_created;

  for v_image in select value from jsonb_array_elements(p_images) loop
    insert into public.message_images (id, message_id, lead_id, position, consent_id, clinic_consent_text_version,
                                       clinic_consent_confirmed_at, storage_path, width, height, bytes, created_at)
    values (
      (v_image ->> 'id')::uuid,
      p_message_id,
      p_lead_id,
      v_position,
      v_consent_id,
      case when v_is_clinic then btrim(p_clinic_consent_version) end,
      case when v_is_clinic then now() end,
      'messages/' || p_lead_id::text || '/' || (v_image ->> 'id') || '.jpg',
      (v_image ->> 'width')::integer,
      (v_image ->> 'height')::integer,
      (v_image ->> 'bytes')::integer,
      v_created
    );
    v_position := v_position + 1;
  end loop;

  return v_created;
end;
$$;

revoke all on function public.send_message_with_images(uuid, uuid, uuid, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.send_message_with_images(uuid, uuid, uuid, text, jsonb, text) to service_role;
