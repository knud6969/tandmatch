-- Billeder i beskedtråden (features/leads/README.md 4.3 `message_images`, 5.5, 5.7, 10.12; platform 5.3, 5.4, 9.1).
--   * Ny tabel message_images: op til 3 billeder pr. besked fra patient eller klinik. Filerne ligger i den private bucket
--     case-images under messages/{lead_id}/{id}.jpg (ingen ny bucket; samme regler som sagsbillederne, 9.2).
--   * messages.body må være tom, når beskeden har billeder. Tjekket "1-2000 tegn" flyttes fra check-constraintet til
--     RLS-policyen for direkte indsættelse og til send_message_with_images().
--   * send_message_with_images(): eneste vej til at indsætte billedrækker. Kun service role, med bruger-id fra den
--     verificerede session (platform 5.1 regel 8); tjekker selv deltager, åben tråd, lofter og patientens samtykke.
--   * clinic_lead_message_images(): klinikkens eneste læsevej (ingen SELECT på tabellen), aldrig ved withdrawn.
--   * withdraw_consent(): tilbagetrækning af image_upload sletter også patientens beskedbilleder og returnerer stierne.

-- messages.body: tom tekst er tilladt ved billeder; længden er stadig højst 2000 tegn.
alter table public.messages drop constraint messages_body_check;
alter table public.messages add constraint messages_body_check check (char_length(btrim(body)) <= 2000);

drop policy messages_insert_participant on public.messages;
create policy messages_insert_participant on public.messages
  for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and char_length(btrim(body)) >= 1
    and public.is_permanent_user()
    and public.is_lead_participant(lead_id)
    and public.is_lead_thread_open(lead_id)
    and public.participant_messages_last_day() < 200
  );

create table public.message_images (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  lead_id uuid not null references public.leads (id) on delete cascade,
  position smallint not null check (position between 0 and 2),
  -- Patientens image_upload-samtykke ved afsendelse; null for klinikkens billeder.
  consent_id uuid null references public.consents (id) on delete cascade,
  storage_path text not null unique,
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  bytes integer not null check (bytes > 0),
  created_at timestamptz not null default now(),
  unique (message_id, position),
  check (storage_path = 'messages/' || lead_id::text || '/' || id::text || '.jpg')
);

create index message_images_message_idx on public.message_images (message_id, position);
create index message_images_lead_idx on public.message_images (lead_id);
create index message_images_consent_idx on public.message_images (consent_id) where consent_id is not null;

alter table public.message_images enable row level security;

-- Kun patienten læser direkte (som messages). Klinikken læser via clinic_lead_message_images().
create policy message_images_select_patient on public.message_images
  for select to authenticated using (public.is_lead_patient(lead_id));
revoke all on public.message_images from anon, authenticated;
grant select (id, message_id, lead_id, position, storage_path, width, height, created_at) on public.message_images to authenticated;
grant all on public.message_images to service_role;

-- Klinikkens læsevej: trådens billeder for egen verificerede klinik, aldrig for et tilbagetrukket lead.
create function public.clinic_lead_message_images(p_lead_id uuid)
returns table (id uuid, message_id uuid, "position" smallint, storage_path text, width integer, height integer)
language sql stable security definer set search_path = ''
as $$
  select i.id, i.message_id, i.position, i.storage_path, i.width, i.height
    from public.message_images i
    join public.leads l on l.id = i.lead_id
   where i.lead_id = p_lead_id
     and l.status <> 'withdrawn'
     and public.is_my_clinic_lead(p_lead_id)
   order by i.created_at, i.message_id, i.position;
$$;

-- Indsætter en besked med billeder i én transaktion. Kaldes kun af serveren med service role, efter at filerne er
-- uploadet til stierne messages/{lead_id}/{id}.jpg; p_user_id er den verificerede brugers id. p_images er en liste af
-- { id, width, height, bytes } i visningsrækkefølge. Returnerer beskedens created_at.
create function public.send_message_with_images(
  p_user_id uuid,
  p_lead_id uuid,
  p_message_id uuid,
  p_body text,
  p_images jsonb
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

  insert into public.messages (id, lead_id, sender_id, body)
  values (p_message_id, p_lead_id, p_user_id, btrim(v_body))
  returning created_at into v_created;

  for v_image in select value from jsonb_array_elements(p_images) loop
    insert into public.message_images (id, message_id, lead_id, position, consent_id, storage_path, width, height, bytes, created_at)
    values (
      (v_image ->> 'id')::uuid,
      p_message_id,
      p_lead_id,
      v_position,
      v_consent_id,
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

-- Som 20261028000500, men tilbagetrækning af image_upload sletter også patientens beskedbilleder (rækker med patientens
-- consent_id); stierne returneres sammen med sagsbillederne, så serveren sletter filerne.
create or replace function public.withdraw_consent(p_consent_id uuid)
returns table (withdrawn_at timestamptz, consent_type public.consent_type, deleted_image_paths text[], closed_conversations integer, withdrawn_leads integer)
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_consent public.consents%rowtype;
  v_at timestamptz := now();
  v_paths text[] := '{}';
  v_message_paths text[] := '{}';
  v_closed integer := 0;
  v_pending boolean;
  v_leads integer := 0;
begin
  if v_uid is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;
  select * into v_consent from public.consents where id = p_consent_id and patient_id = v_uid for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_consent.withdrawn_at is not null then
    if v_consent.cleanup_done then
      raise exception 'ALREADY_WITHDRAWN' using errcode = 'P0001';
    end if;
    if v_consent.type = 'ai_processing' then
      with c as (
        update public.ai_conversations set status = 'closed' where patient_id = v_uid and status = 'active' returning 1
      ) select count(*) into v_closed from c;
    end if;
    return query
      select v_consent.withdrawn_at, v_consent.type, coalesce(v_consent.pending_storage_paths, '{}'), v_closed, 0;
    return;
  end if;

  -- Alle aktive samtykker af typen (den valgte række og andre versioner) får samme tidspunkt.
  update public.consents c set withdrawn_at = v_at
   where c.patient_id = v_uid and c.type = v_consent.type and c.withdrawn_at is null;

  if v_consent.type = 'image_upload' then
    with d as (
      delete from public.case_images where patient_id = v_uid returning storage_path
    ) select coalesce(array_agg(d.storage_path), '{}') into v_paths from d;
    with d as (
      delete from public.message_images i
       using public.consents c
       where c.id = i.consent_id and c.patient_id = v_uid
      returning i.storage_path
    ) select coalesce(array_agg(d.storage_path), '{}') into v_message_paths from d;
    v_paths := v_paths || v_message_paths;
  elsif v_consent.type = 'ai_processing' then
    with c as (
      update public.ai_conversations set status = 'closed' where patient_id = v_uid and status = 'active' returning 1
    ) select count(*) into v_closed from c;
  elsif v_consent.type = 'health_data_sharing' then
    -- Ubesvarede og accepterede leads uden booking trækkes tilbage, reservationer frigives. Bookede bookinger består.
    v_leads := public.withdraw_open_leads(v_uid, null);
  end if;

  v_pending := (v_consent.type = 'image_upload' and coalesce(array_length(v_paths, 1), 0) > 0)
            or (v_consent.type = 'ai_processing' and not public.is_permanent_user());

  update public.consents
     set pending_storage_paths = case when v_consent.type = 'image_upload' then v_paths else null end,
         cleanup_done = not v_pending
   where id = p_consent_id;

  return query select v_at, v_consent.type, v_paths, v_closed, v_leads;
end;
$$;

revoke all on function public.clinic_lead_message_images(uuid) from public, anon;
grant execute on function public.clinic_lead_message_images(uuid) to authenticated;
revoke all on function public.send_message_with_images(uuid, uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.send_message_with_images(uuid, uuid, uuid, text, jsonb) to service_role;
-- create or replace bevarer grants, men de gentages, så filen kan læses alene.
revoke all on function public.withdraw_consent(uuid) from public, anon;
grant execute on function public.withdraw_consent(uuid) to authenticated;
