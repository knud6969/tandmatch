-- Byggetrin 4: patientens valg af svar (architecture 5.3, 10.8.1, 4.3).
-- decide_response() er den eneste vej til at ændre patient_decision. Kun forespørgslens ejer kan kalde den.
-- Ved 'chosen' lukkes forespørgslen (status 'closed'), og der kan kun være ét valgt svar pr. forespørgsel.

-- 1. Backstop: højst ét 'chosen' svar pr. forespørgsel, også ved direkte skrivning.
create unique index responses_one_chosen_per_request
  on public.responses (request_id)
  where patient_decision = 'chosen';

-- 2. Beslutning. Fejl bruger fejlkoder i teksten, som API'et oversætter.
create or replace function public.decide_response(p_response_id uuid, p_decision text)
returns public.responses
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := (select auth.uid());
  v_resp public.responses%rowtype;
  v_req public.requests%rowtype;
  v_row public.responses%rowtype;
begin
  if v_uid is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;
  if p_decision is null or p_decision not in ('chosen', 'declined') then
    raise exception 'INVALID_DECISION' using errcode = '22023';
  end if;

  select * into v_resp from public.responses where id = p_response_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  select * into v_req from public.requests where id = v_resp.request_id for update;
  -- Ikke ejer får samme svar som "findes ikke" (ingen lækage af id'er).
  if v_req.patient_id is distinct from v_uid then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_resp.patient_decision <> 'none' then
    raise exception 'ALREADY_DECIDED' using errcode = 'P0001';
  end if;
  if v_resp.status <> 'sent' then
    raise exception 'RESPONSE_WITHDRAWN' using errcode = 'P0001';
  end if;
  if v_req.status <> 'sent' or v_req.expires_at is null or v_req.expires_at <= now() then
    raise exception 'REQUEST_CLOSED' using errcode = 'P0001';
  end if;

  perform set_config('tm.system', 'on', true);
  update public.responses
     set patient_decision = p_decision::public.patient_decision,
         patient_seen_at = coalesce(patient_seen_at, now())
   where id = p_response_id
  returning * into v_row;

  if p_decision = 'chosen' then
    update public.requests set status = 'closed' where id = v_req.id;
  end if;
  perform set_config('tm.system', '', true);

  return v_row;
end;
$fn$;

revoke all on function public.decide_response(uuid, text) from public, anon;
grant execute on function public.decide_response(uuid, text) to authenticated;
