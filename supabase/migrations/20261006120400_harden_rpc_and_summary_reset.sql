-- Hærdning (reviewer runde 3).
-- 1. append_assistant_message() nulstiller summary_approved_at i samme transaktion som beskeden.
--    Patienten må ikke selv skrive feltet (guarden), så nulstillingen sker i den security definer-funktion.
-- 2. try_consume_anonymous_ai_call() må ikke kaldes direkte af klienter. Kun service_role (serveren)
--    og consume_summary_generation() (som kører som ejer) må forbruge det fælles døgnloft.

-- 1. Assistentsvar med godkendelses-reset.
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

  -- Ny besked i samtalen kan ændre grundlaget for opsummeringen, så godkendelsen nulstilles (architecture 9.3).
  perform set_config('tm.system', 'on', true);
  update public.requests
     set summary_approved_at = null
   where id = v_conv.request_id
     and status = 'draft'
     and summary_approved_at is not null;
  perform set_config('tm.system', '', true);

  return v_row;
end;
$fn$;

-- 2. Det fælles anonyme døgnloft: ingen direkte kald fra klienter.
revoke all on function public.try_consume_anonymous_ai_call() from public, anon, authenticated;
grant execute on function public.try_consume_anonymous_ai_call() to service_role;
