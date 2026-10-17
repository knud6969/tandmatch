-- 3.7b (security M1, M2, L1): AI-lofterne kan kun forbruges af serveren, og døgnloftet pr. patient kan ikke omgås.
--
-- M2: reserve_chat_turn() og consume_summary_generation() kunne kaldes direkte via PostgREST med patientens JWT,
--     uden om IP-grænsen, og en anonym bruger kunne dermed tømme det globale anonyme loft. De får nu p_user_id (den
--     verificerede session, sat af serveren efter IP-grænsen) og kan kun udføres af service role (architecture 2.3 a).
--     Funktionerne tjekker selv ejerskab og samtykke for p_user_id.
-- M1: døgnloftet for chatbeskeder talte ai_messages, som slettes med sagen (slet og opret igen omgik loftet). Det tælles
--     nu i ai_patient_usage_daily.chat_messages, som hører til patienten og ikke slettes med sagen.
-- L1: den gamle insert-policy på ai_messages fjernes, så reserve_chat_turn() er eneste vej for brugerbeskeder.

insert into public.ai_limits (key, value) values
  ('chat_messages_per_conversation', 30),
  ('chat_message_max_chars', 1000);

alter table public.ai_patient_usage_daily
  add column chat_messages integer not null default 0 check (chat_messages >= 0);

-- L1
drop policy ai_messages_insert_own_user on public.ai_messages;
revoke insert on public.ai_messages from authenticated;
drop function public.patient_user_messages_last_day();

-- reserve_chat_turn(): én reserveret tur pr. kald. Fejl: UNAUTHENTICATED, INVALID_INPUT, NOT_FOUND (ikke patientens
-- samtale), NOT_DRAFT, CONSENT_REQUIRED, CHAT_LIMIT, RATE_LIMITED (patientens døgnloft), ANON_USER_LIMIT, ANON_CAP_REACHED.
-- Ved en fejl rulles alt tilbage, også tællerne.
drop function public.reserve_chat_turn(uuid, text);
create function public.reserve_chat_turn(p_user_id uuid, p_conversation_id uuid, p_content text)
returns table (message_id uuid, message_content text, message_created_at timestamptz, user_message_count integer)
language plpgsql security definer set search_path = ''
as $$
declare
  v_conv public.ai_conversations%rowtype;
  v_case_status public.case_status;
  v_per_day integer := public.ai_limit('chat_messages_per_patient_day');
  v_per_conv integer := public.ai_limit('chat_messages_per_conversation');
  v_max_chars integer := public.ai_limit('chat_message_max_chars');
  v_day date := (now() at time zone 'utc')::date;
  v_anonymous boolean;
  v_used text;
  v_ok boolean;
  v_row public.ai_messages%rowtype;
begin
  if p_user_id is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;
  if p_content is null or v_per_day is null or v_per_conv is null or v_max_chars is null
     or char_length(btrim(p_content)) = 0 or char_length(p_content) > v_max_chars then
    raise exception 'INVALID_INPUT' using errcode = '22023';
  end if;
  -- Først patienten (døgnloftet gælder på tværs af samtaler), så samtalen. Samme rækkefølge hver gang.
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
  if v_conv.status <> 'active' or v_conv.user_message_count >= v_per_conv then
    raise exception 'CHAT_LIMIT' using errcode = 'P0001';
  end if;
  -- Døgnloftet tælles i en tabel, der ikke slettes med sagen (M1). Atomisk: tælleren stiger kun under loftet.
  insert into public.ai_patient_usage_daily as u (patient_id, day, chat_messages)
  values (p_user_id, v_day, 1)
  on conflict (patient_id, day) do update set chat_messages = u.chat_messages + 1 where u.chat_messages < v_per_day
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
  insert into public.ai_messages (conversation_id, patient_id, role, content)
  values (p_conversation_id, p_user_id, 'user', p_content)
  returning * into v_row;
  return query
    select v_row.id, v_row.content, v_row.created_at,
           (select c.user_message_count from public.ai_conversations c where c.id = p_conversation_id);
end;
$$;
revoke all on function public.reserve_chat_turn(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.reserve_chat_turn(uuid, uuid, text) to service_role;

-- consume_summary_generation(): som før, men kun service role, med p_user_id og eget samtykketjek.
drop function public.consume_summary_generation(uuid);
create function public.consume_summary_generation(p_user_id uuid, p_case_id uuid)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_case public.cases%rowtype;
  v_anonymous boolean;
  v_per_case integer;
  v_per_day integer := public.ai_limit('summary_generations_per_patient_day');
  v_day date := (now() at time zone 'utc')::date;
  v_ok boolean;
  v_count integer;
begin
  if p_user_id is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;
  select * into v_case from public.cases where id = p_case_id and patient_id = p_user_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_case.status <> 'draft' then
    raise exception 'NOT_DRAFT' using errcode = 'P0001';
  end if;
  if not coalesce((
       select k.withdrawn_at is null from public.consents k
        where k.patient_id = p_user_id and k.type = 'ai_processing'
        order by k.created_at desc limit 1
     ), false) then
    raise exception 'CONSENT_REQUIRED' using errcode = '42501';
  end if;
  select p.is_anonymous into v_anonymous from public.profiles p where p.id = p_user_id;
  v_per_case := case when coalesce(v_anonymous, false)
                     then public.ai_limit('summary_generations_per_case_anonymous')
                     else public.ai_limit('summary_generations_per_case') end;
  if v_case.ai_generation_count >= v_per_case then
    raise exception 'SUMMARY_LIMIT' using errcode = 'P0001';
  end if;
  insert into public.ai_patient_usage_daily as u (patient_id, day, summary_generations)
  values (p_user_id, v_day, 1)
  on conflict (patient_id, day) do update set summary_generations = u.summary_generations + 1
    where u.summary_generations < v_per_day
  returning true into v_ok;
  if v_ok is null then
    raise exception 'DAILY_SUMMARY_LIMIT' using errcode = 'P0001';
  end if;
  -- Anonyme forbruger også deres eget døgnloft, så én bruger ikke kan tømme det globale loft.
  if coalesce(v_anonymous, false) then
    declare v_used text := public.consume_anonymous_ai_call(p_user_id);
    begin
      if v_used = 'user_cap' then
        raise exception 'ANON_USER_LIMIT' using errcode = 'P0001';
      elsif v_used <> 'ok' then
        raise exception 'ANON_CAP_REACHED' using errcode = 'P0001';
      end if;
    end;
  end if;
  perform set_config('tm.system', 'on', true);
  update public.cases set ai_generation_count = ai_generation_count + 1 where id = p_case_id
  returning ai_generation_count into v_count;
  perform set_config('tm.system', '', true);
  return v_per_case - v_count;
end;
$$;
revoke all on function public.consume_summary_generation(uuid, uuid) from public, anon, authenticated;
grant execute on function public.consume_summary_generation(uuid, uuid) to service_role;
