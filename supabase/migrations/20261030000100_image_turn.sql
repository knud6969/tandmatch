-- Billedtur (features/cases/README.md 7.9c): AI'en reagerer selv på uploadede billeder, uden en patientbesked.
-- reserve_image_turn() reserverer turen atomisk FØR modelkaldet: den tjekker ejer, kladde, samtykker og samtale, tæller
-- døgnloftet og stempler de nye billeder (ai_turn_at), så der højst er én tur pr. upload-batch. Tæller ikke som en
-- patientbesked (user_message_count, chat_messages) og indsætter ingen brugerbesked.

alter table public.case_images add column ai_turn_at timestamptz null;

insert into public.ai_limits (key, value) values ('image_turns_per_patient_day', 30);

alter table public.ai_patient_usage_daily
  add column image_turns integer not null default 0 check (image_turns >= 0);

-- Fejl: UNAUTHENTICATED, NOT_FOUND, NOT_DRAFT, CONSENT_REQUIRED (ai_processing), IMAGE_CONSENT_REQUIRED, CHAT_LIMIT
-- (samtalen er lukket), NO_NEW_IMAGES, RATE_LIMITED, ANON_USER_LIMIT, ANON_CAP_REACHED. Ved en fejl rulles alt tilbage.
-- Returnerer id'erne på de billeder, der blev taget med i turen (ældste først).
create function public.reserve_image_turn(p_user_id uuid, p_conversation_id uuid)
returns uuid[]
language plpgsql security definer set search_path = ''
as $$
declare
  v_conv public.ai_conversations%rowtype;
  v_case_status public.case_status;
  v_per_day integer := public.ai_limit('image_turns_per_patient_day');
  v_day date := (now() at time zone 'utc')::date;
  v_anonymous boolean;
  v_used text;
  v_ok boolean;
  v_ids uuid[];
begin
  if p_user_id is null or v_per_day is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;
  -- Samme låserækkefølge som reserve_chat_turn(): først patienten, så samtalen.
  perform pg_advisory_xact_lock(hashtextextended('chat:' || p_user_id::text, 0));
  select * into v_conv from public.ai_conversations c where c.id = p_conversation_id and c.patient_id = p_user_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  select k.status into v_case_status from public.cases k where k.id = v_conv.case_id;
  if v_case_status is distinct from 'draft' then
    raise exception 'NOT_DRAFT' using errcode = 'P0001';
  end if;
  if not coalesce((
       select k.withdrawn_at is null from public.consents k
        where k.patient_id = p_user_id and k.type = 'ai_processing'
        order by k.created_at desc limit 1
     ), false) then
    raise exception 'CONSENT_REQUIRED' using errcode = '42501';
  end if;
  if not coalesce((
       select k.withdrawn_at is null from public.consents k
        where k.patient_id = p_user_id and k.type = 'image_upload'
        order by k.created_at desc limit 1
     ), false) then
    raise exception 'IMAGE_CONSENT_REQUIRED' using errcode = '42501';
  end if;
  if v_conv.status <> 'active' then
    raise exception 'CHAT_LIMIT' using errcode = 'P0001';
  end if;
  select coalesce(array_agg(i.id order by i.created_at, i.id), '{}') into v_ids
    from public.case_images i
   where i.case_id = v_conv.case_id and i.patient_id = p_user_id and i.ai_turn_at is null;
  if cardinality(v_ids) = 0 then
    raise exception 'NO_NEW_IMAGES' using errcode = 'P0001';
  end if;
  insert into public.ai_patient_usage_daily as u (patient_id, day, image_turns)
  values (p_user_id, v_day, 1)
  on conflict (patient_id, day) do update set image_turns = u.image_turns + 1 where u.image_turns < v_per_day
  returning true into v_ok;
  if v_ok is null then
    raise exception 'RATE_LIMITED' using errcode = 'P0001';
  end if;
  select p.is_anonymous into v_anonymous from public.profiles p where p.id = p_user_id;
  if coalesce(v_anonymous, false) then
    v_used := public.consume_anonymous_ai_call(p_user_id);
    if v_used = 'user_cap' then
      raise exception 'ANON_USER_LIMIT' using errcode = 'P0001';
    elsif v_used <> 'ok' then
      raise exception 'ANON_CAP_REACHED' using errcode = 'P0001';
    end if;
  end if;
  update public.case_images set ai_turn_at = now() where id = any (v_ids);
  return v_ids;
end;
$$;
revoke all on function public.reserve_image_turn(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reserve_image_turn(uuid, uuid) to service_role;
