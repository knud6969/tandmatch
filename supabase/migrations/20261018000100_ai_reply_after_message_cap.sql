-- Svaret på patientens 30. besked (architecture 7.6): triggeren ai_messages_after_insert() lukker samtalen, når den 30.
-- brugerbesked er indsat, og så kunne append_assistant_message() ikke gemme svaret på netop den besked.
-- Rettelse: en lukket samtale accepterer stadig ét svar, hvis den seneste besked er patientens (et ubesvaret spørgsmål).
-- Alt andet er uændret: ejer tjekkes mod p_user_id, ydelserne skal være aktive, og funktionen kan kun udføres af service role.
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
  v_last_role public.ai_message_role;
begin
  select * into v_conv from public.ai_conversations where id = p_conversation_id and patient_id = p_user_id;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_conv.status <> 'active' then
    select m.role into v_last_role from public.ai_messages m
     where m.conversation_id = p_conversation_id order by m.created_at desc, m.id desc limit 1;
    if v_last_role is distinct from 'user' then
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
