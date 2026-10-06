-- Lås beskyttede felter på requests. Patienter må ikke kunne nulstille AI-tælleren eller sætte
-- godkendelse/AI-output direkte via PostgREST. Ændringer sker kun via security definer-funktioner,
-- som sætter tm.system (eller tm.transition ved afsendelse).

-- 1. Guard: beskyttede kolonner kan kun ændres af systemet.
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

-- 2. Indsæt: en ny kladde må ikke have AI-tæller, AI-output eller godkendelse.
drop policy if exists requests_insert_own_draft on public.requests;
create policy requests_insert_own_draft on public.requests
  for insert
  with check (
    patient_id = (select auth.uid())
    and public.auth_role() = 'patient'
    and status = 'draft'
    and sent_at is null
    and sharing_consent_id is null
    and summary_approved_at is null
    and summary_ai_assisted = false
    and ai_summary is null
    and ai_model is null
    and ai_prompt_version is null
    and ai_generation_count = 0
  );

-- 3. Godkendelse af opsummering (patientens handling, kun for kladder).
create or replace function public.approve_summary(p_request_id uuid, p_summary_text text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := (select auth.uid());
  v_req public.requests%rowtype;
  v_at timestamptz := now();
begin
  if v_uid is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;
  if p_summary_text is null or char_length(btrim(p_summary_text)) = 0 or char_length(p_summary_text) > 1500 then
    raise exception 'INVALID_SUMMARY' using errcode = '22023';
  end if;

  select * into v_req from public.requests where id = p_request_id and patient_id = v_uid for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_req.status <> 'draft' then
    raise exception 'NOT_DRAFT' using errcode = 'P0001';
  end if;

  perform set_config('tm.system', 'on', true);
  update public.requests
     set summary_text = p_summary_text, summary_approved_at = v_at
   where id = p_request_id;
  perform set_config('tm.system', '', true);
  return v_at;
end;
$fn$;

revoke all on function public.approve_summary(uuid, text) from public, anon;
grant execute on function public.approve_summary(uuid, text) to authenticated;

-- 4. Gem AI-udkast (kun ejer, kun kladde). Kaldes af summary-routen efter AI-kaldet.
create or replace function public.store_ai_summary(p_request_id uuid, p_summary jsonb, p_ai_assisted boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := (select auth.uid());
  v_req public.requests%rowtype;
begin
  if v_uid is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;
  select * into v_req from public.requests where id = p_request_id and patient_id = v_uid for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_req.status <> 'draft' then
    raise exception 'NOT_DRAFT' using errcode = 'P0001';
  end if;

  perform set_config('tm.system', 'on', true);
  update public.requests
     set ai_summary = p_summary, summary_ai_assisted = coalesce(p_ai_assisted, false)
   where id = p_request_id;
  perform set_config('tm.system', '', true);
end;
$fn$;

revoke all on function public.store_ai_summary(uuid, jsonb, boolean) from public, anon;
grant execute on function public.store_ai_summary(uuid, jsonb, boolean) to authenticated;

-- 5. Udkast-tæller. Tjekker forespørgsels-loft (3 anonyme, 5 ellers) og døgnloft (20) først.
-- Det globale anonyme AI-loft forbruges KUN hvis alle andre tjek går igennem. Enhver fejl rulles tilbage.
create or replace function public.consume_summary_generation(p_request_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := (select auth.uid());
  v_req public.requests%rowtype;
  v_anonymous boolean;
  v_per_request integer;
  v_per_day integer := public.ai_limit('summary_generations_per_patient_day');
  v_day date := (now() at time zone 'utc')::date;
  v_ok boolean;
  v_count integer;
begin
  if v_uid is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;

  select * into v_req from public.requests
   where id = p_request_id and patient_id = v_uid
   for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_req.status <> 'draft' then
    raise exception 'NOT_DRAFT' using errcode = 'P0001';
  end if;

  select p.is_anonymous into v_anonymous from public.profiles p where p.id = v_uid;
  v_per_request := case
    when coalesce(v_anonymous, false) then public.ai_limit('summary_generations_per_request_anonymous')
    else public.ai_limit('summary_generations_per_request')
  end;

  if v_req.ai_generation_count >= v_per_request then
    raise exception 'SUMMARY_LIMIT' using errcode = 'P0001';
  end if;

  insert into public.ai_patient_usage_daily as u (patient_id, day, summary_generations)
  values (v_uid, v_day, 1)
  on conflict (patient_id, day) do update
    set summary_generations = u.summary_generations + 1
    where u.summary_generations < v_per_day
  returning true into v_ok;
  if v_ok is null then
    raise exception 'DAILY_SUMMARY_LIMIT' using errcode = 'P0001';
  end if;

  -- Sidst: det globale anonyme loft. Fejler det, rulles de tidligere tællere tilbage.
  if coalesce(v_anonymous, false) and not public.try_consume_anonymous_ai_call() then
    raise exception 'ANON_CAP_REACHED' using errcode = 'P0001';
  end if;

  perform set_config('tm.system', 'on', true);
  update public.requests
     set ai_generation_count = ai_generation_count + 1
   where id = p_request_id
  returning ai_generation_count into v_count;
  perform set_config('tm.system', '', true);

  return v_per_request - v_count;
end;
$fn$;

revoke all on function public.consume_summary_generation(uuid) from public, anon;
grant execute on function public.consume_summary_generation(uuid) to authenticated;

-- 6. Billedændring nulstiller godkendelse. Bruger tm.system, så guarden tillader det.
create or replace function public.request_images_reset_approval()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  perform set_config('tm.system', 'on', true);
  update public.requests
     set summary_approved_at = null
   where id = case when tg_op = 'DELETE' then old.request_id else new.request_id end
     and status = 'draft'
     and summary_approved_at is not null;
  perform set_config('tm.system', '', true);
  return null;
end;
$fn$;
