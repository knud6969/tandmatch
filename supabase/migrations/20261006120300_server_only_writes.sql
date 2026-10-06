-- Server-only skrivninger (reviewer runde 2).
-- 1. Patienter kan kun indsætte role='user' i ai_messages. Assistentsvar skrives af serveren.
-- 2. append_assistant_message() og store_ai_summary() kan kun kaldes af service_role (serverens route).
-- 3. summary_text er låst: ændres kun via approve_summary() (guard).

-- 1. ai_messages: patient-insert kun for brugerbeskeder.
drop policy if exists ai_messages_insert_own on public.ai_messages;
create policy ai_messages_insert_own_user on public.ai_messages
  for insert
  with check (
    role = 'user'
    and patient_id = (select auth.uid())
    and exists (
      select 1 from public.ai_conversations c
      where c.id = conversation_id
        and c.patient_id = (select auth.uid())
        and c.status = 'active'
        and c.user_message_count < 30
    )
    and public.has_active_consent('ai_processing')
    and public.patient_user_messages_last_day() < 100
  );

-- 2a. Assistentsvar. Kun service role. Returnerer den indsatte række.
create or replace function public.append_assistant_message(
  p_conversation_id uuid,
  p_content text,
  p_out_of_scope text[],
  p_blocked boolean,
  p_ready boolean
)
returns public.ai_messages
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_conv public.ai_conversations%rowtype;
  v_row public.ai_messages%rowtype;
begin
  select * into v_conv from public.ai_conversations where id = p_conversation_id;
  if not found or v_conv.status <> 'active' then
    raise exception 'CONVERSATION_CLOSED' using errcode = 'P0001';
  end if;

  insert into public.ai_messages (conversation_id, patient_id, role, content, out_of_scope, blocked, ready_for_summary)
  values (
    p_conversation_id,
    v_conv.patient_id,
    'assistant',
    p_content,
    coalesce(p_out_of_scope, '{}')::public.out_of_scope_topic[],
    coalesce(p_blocked, false),
    coalesce(p_ready, false)
  )
  returning * into v_row;

  return v_row;
end;
$fn$;

revoke all on function public.append_assistant_message(uuid, text, text[], boolean, boolean) from public, anon, authenticated;
grant execute on function public.append_assistant_message(uuid, text, text[], boolean, boolean) to service_role;

-- 2b. Gem AI-udkast. Kun service role. Ingen uid-tjek her (kaldes efter serverens ejerskabstjek).
create or replace function public.store_ai_summary(p_request_id uuid, p_summary jsonb, p_ai_assisted boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_status public.request_status;
begin
  select status into v_status from public.requests where id = p_request_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_status <> 'draft' then
    raise exception 'NOT_DRAFT' using errcode = 'P0001';
  end if;

  perform set_config('tm.system', 'on', true);
  update public.requests
     set ai_summary = p_summary, summary_ai_assisted = coalesce(p_ai_assisted, false)
   where id = p_request_id;
  perform set_config('tm.system', '', true);
end;
$fn$;

revoke all on function public.store_ai_summary(uuid, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.store_ai_summary(uuid, jsonb, boolean) to service_role;

-- 3. Guard: summary_text låses som de øvrige systemfelter.
create or replace function public.requests_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_system boolean := coalesce(current_setting('tm.system', true), '') = 'on'
                   or coalesce(current_setting('tm.transition', true), '') = 'on';
begin
  if new.id is distinct from old.id or new.patient_id is distinct from old.patient_id then
    raise exception 'Feltet kan ikke ændres' using errcode = '42501';
  end if;

  if not v_system and (
       new.status is distinct from old.status
    or new.sent_at is distinct from old.sent_at
    or new.expires_at is distinct from old.expires_at
    or new.sharing_consent_id is distinct from old.sharing_consent_id
    or new.ai_generation_count is distinct from old.ai_generation_count
    or new.ai_summary is distinct from old.ai_summary
    or new.ai_model is distinct from old.ai_model
    or new.ai_prompt_version is distinct from old.ai_prompt_version
    or new.summary_ai_assisted is distinct from old.summary_ai_assisted
    or new.summary_approved_at is distinct from old.summary_approved_at
    or new.summary_text is distinct from old.summary_text
  ) then
    raise exception 'Feltet ændres kun af systemet' using errcode = '42501';
  end if;

  -- Ændres indholdet efter godkendelse, nulstilles godkendelsen (architecture 4.3).
  if (new.category, new.answers, new.free_text, new.max_distance_km)
     is distinct from (old.category, old.answers, old.free_text, old.max_distance_km) then
    new.summary_approved_at := null;
  end if;

  new.updated_at := now();
  return new;
end;
$fn$;
