-- 3.6b H1 og L1: chat-turen reserveres atomisk, før modelkaldet (architecture 7.6, 5.3).
-- Før tællede lofterne først ved indsættelsen efter modelkaldet, så samtidige kald kunne give flere OpenAI-kald end loftet.
-- reserve_chat_turn() låser patienten og samtalen, tjekker og tæller lofterne og indsætter brugerbeskeden i én transaktion.
-- Desuden: loft pr. anonym bruger pr. døgn, så én bruger ikke kan tømme det globale anonyme loft, og en strammere
-- append_assistant_message().

insert into public.ai_limits (key, value) values
  ('anon_user_daily_ai_calls', 40),
  ('chat_messages_per_patient_day', 100);

-- Anonyme AI-kald pr. bruger pr. døgn (UTC). Ingen brugeradgang; kun funktionerne nedenfor.
create table public.ai_anon_user_usage_daily (
  user_id uuid not null references public.patients (id) on delete cascade,
  day date not null,
  calls integer not null default 0 check (calls >= 0),
  primary key (user_id, day)
);
alter table public.ai_anon_user_usage_daily enable row level security;
revoke all on public.ai_anon_user_usage_daily from anon, authenticated;

-- Intern funktion: forbruger ét anonymt AI-kald. Først brugerens eget døgnloft, så det globale. Returnerer 'ok',
-- 'user_cap', 'global_cap' eller 'denied' (ikke en anonym bruger). Kan kun kaldes fra andre security definer-funktioner.
create function public.consume_anonymous_ai_call(p_user_id uuid)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_global integer := public.ai_limit('anon_daily_ai_calls');
  v_user integer := public.ai_limit('anon_user_daily_ai_calls');
  v_day date := (now() at time zone 'utc')::date;
  v_ok boolean;
begin
  if v_global is null or v_user is null or p_user_id is null then
    return 'denied';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_user_id and p.is_anonymous) then
    return 'denied';
  end if;
  insert into public.ai_anon_user_usage_daily as u (user_id, day, calls)
  values (p_user_id, v_day, 1)
  on conflict (user_id, day) do update set calls = u.calls + 1 where u.calls < v_user
  returning true into v_ok;
  if v_ok is null then
    return 'user_cap';
  end if;
  v_ok := null;
  insert into public.ai_usage_daily as g (day, anonymous_calls)
  values (v_day, 1)
  on conflict (day) do update set anonymous_calls = g.anonymous_calls + 1 where g.anonymous_calls < v_global
  returning true into v_ok;
  if v_ok is null then
    -- Det globale loft er nået: brugerens eget kald fortrydes, så et afvist kald ikke tæller.
    update public.ai_anon_user_usage_daily set calls = calls - 1 where user_id = p_user_id and day = v_day;
    return 'global_cap';
  end if;
  return 'ok';
end;
$$;
revoke all on function public.consume_anonymous_ai_call(uuid) from public, anon, authenticated, service_role;

-- Uændret kontrakt (boolean, kun service role), men nu med loft pr. bruger.
create or replace function public.try_consume_anonymous_ai_call(p_user_id uuid)
returns boolean
language sql security definer set search_path = ''
as $$ select public.consume_anonymous_ai_call(p_user_id) = 'ok'; $$;

-- reserve_chat_turn(): patientens egen JWT. Ét kald = én reserveret tur. Fejl: UNAUTHENTICATED, INVALID_INPUT,
-- NOT_FOUND, NOT_DRAFT, CONSENT_REQUIRED, CHAT_LIMIT, RATE_LIMITED (patientens døgnloft), ANON_USER_LIMIT (anonym
-- brugers døgnloft), ANON_CAP_REACHED (det globale anonyme loft). Ved en fejl rulles alt tilbage, også tællerne.
create function public.reserve_chat_turn(p_conversation_id uuid, p_content text)
returns table (message_id uuid, message_content text, message_created_at timestamptz, user_message_count integer)
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_conv public.ai_conversations%rowtype;
  v_case_status public.case_status;
  v_per_day integer := public.ai_limit('chat_messages_per_patient_day');
  v_anonymous boolean;
  v_used text;
  v_row public.ai_messages%rowtype;
begin
  if v_uid is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;
  if p_content is null or char_length(btrim(p_content)) = 0 or char_length(p_content) > 1000 or v_per_day is null then
    raise exception 'INVALID_INPUT' using errcode = '22023';
  end if;
  -- Først patienten (døgnloftet gælder på tværs af samtaler), så samtalen. Samme rækkefølge hver gang.
  perform pg_advisory_xact_lock(hashtextextended('chat:' || v_uid::text, 0));
  select * into v_conv from public.ai_conversations c where c.id = p_conversation_id and c.patient_id = v_uid for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  select k.status into v_case_status from public.cases k where k.id = v_conv.case_id;
  if v_case_status is distinct from 'draft' then
    raise exception 'NOT_DRAFT' using errcode = 'P0001';
  end if;
  if not public.has_active_consent('ai_processing') then
    raise exception 'CONSENT_REQUIRED' using errcode = '42501';
  end if;
  if v_conv.status <> 'active' or v_conv.user_message_count >= 30 then
    raise exception 'CHAT_LIMIT' using errcode = 'P0001';
  end if;
  if (select count(*) from public.ai_messages m
       where m.patient_id = v_uid and m.role = 'user' and m.created_at > now() - interval '1 day') >= v_per_day then
    raise exception 'RATE_LIMITED' using errcode = 'P0001';
  end if;
  select p.is_anonymous into v_anonymous from public.profiles p where p.id = v_uid;
  if coalesce(v_anonymous, false) then
    v_used := public.consume_anonymous_ai_call(v_uid);
    if v_used = 'user_cap' then
      raise exception 'ANON_USER_LIMIT' using errcode = 'P0001';
    elsif v_used <> 'ok' then
      raise exception 'ANON_CAP_REACHED' using errcode = 'P0001';
    end if;
  end if;
  insert into public.ai_messages (conversation_id, patient_id, role, content)
  values (p_conversation_id, v_uid, 'user', p_content)
  returning * into v_row;
  return query
    select v_row.id, v_row.content, v_row.created_at,
           (select c.user_message_count from public.ai_conversations c where c.id = p_conversation_id);
end;
$$;
revoke all on function public.reserve_chat_turn(uuid, text) from public, anon;
grant execute on function public.reserve_chat_turn(uuid, text) to authenticated;

-- L1: append_assistant_message() accepterer kun et svar, når
--   - patientens ai_processing-samtykke stadig er aktivt (ellers ingen skrivning efter tilbagetrækning),
--   - sagen stadig er en kladde, og
--   - samtalen er aktiv, eller er lukket af loftet på 30 beskeder, og der er et ubesvaret spørgsmål.
-- En samtale lukket af tilbagetrækning eller af at sagen er sendt/lukket accepterer ingen svar.
create or replace function public.append_assistant_message(
  p_user_id uuid, p_conversation_id uuid, p_content text, p_preliminary_assessment text,
  p_suggested_service_ids uuid[], p_emergency boolean, p_out_of_scope text[], p_blocked boolean, p_ready boolean
)
returns public.ai_messages
language plpgsql security definer set search_path = ''
as $$
declare
  v_conv public.ai_conversations%rowtype;
  v_row public.ai_messages%rowtype;
  v_ids uuid[] := coalesce(p_suggested_service_ids, '{}');
begin
  select * into v_conv from public.ai_conversations c where c.id = p_conversation_id and c.patient_id = p_user_id;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if not coalesce((
       select k.withdrawn_at is null from public.consents k
        where k.patient_id = p_user_id and k.type = 'ai_processing'
        order by k.created_at desc limit 1
     ), false) then
    raise exception 'CONSENT_REQUIRED' using errcode = '42501';
  end if;
  if not exists (select 1 from public.cases k where k.id = v_conv.case_id and k.status = 'draft') then
    raise exception 'CONVERSATION_CLOSED' using errcode = 'P0001';
  end if;
  if v_conv.status <> 'active' then
    if v_conv.user_message_count < 30 then
      raise exception 'CONVERSATION_CLOSED' using errcode = 'P0001';
    end if;
    -- Kun et ubesvaret spørgsmål kan få svar: flere brugerbeskeder end svar (robust over for samtidige ture, hvor svarene
    -- gemmes i vilkårlig rækkefølge efter, at loftet har lukket samtalen).
    if (select count(*) from public.ai_messages m where m.conversation_id = p_conversation_id and m.role = 'assistant')
       >= (select count(*) from public.ai_messages m where m.conversation_id = p_conversation_id and m.role = 'user') then
      raise exception 'CONVERSATION_CLOSED' using errcode = 'P0001';
    end if;
  end if;
  if exists (
    select 1 from unnest(v_ids) as i(id)
     where not exists (select 1 from public.services s where s.id = i.id and s.is_active)
  ) then
    raise exception 'INVALID_SERVICE' using errcode = '22023';
  end if;
  insert into public.ai_messages (
    conversation_id, patient_id, role, content, preliminary_assessment, suggested_service_ids,
    emergency, out_of_scope, blocked, ready_for_summary
  ) values (
    p_conversation_id, v_conv.patient_id, 'assistant', p_content, p_preliminary_assessment, v_ids,
    coalesce(p_emergency, false), coalesce(p_out_of_scope, '{}')::public.out_of_scope_topic[],
    coalesce(p_blocked, false), coalesce(p_ready, false)
  ) returning * into v_row;
  return v_row;
end;
$$;
