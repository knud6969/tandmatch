-- Del 6: sager, bekræftede ydelser, AI-samtaler og -beskeder, AI-lofter og -funktioner
-- (architecture 4.3, 5.1, 5.3, 5.4, 7.6). Sagens indhold er kun synligt for patienten; klinikker læser via clinic_*.

create table public.cases (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  status public.case_status not null default 'draft',
  is_emergency boolean not null default false,
  postal_code text null check (postal_code is null or postal_code ~ '^[0-9]{4}$'),
  preferred_timeframe public.case_timeframe null,
  ai_summary jsonb null,
  ai_model text null check (char_length(ai_model) <= 80),
  ai_prompt_version text null check (char_length(ai_prompt_version) <= 40),
  ai_generation_count integer not null default 0 check (ai_generation_count between 0 and 5),
  summary_text text null check (char_length(summary_text) <= 1500),
  summary_ai_assisted boolean not null default false,
  summary_approved_at timestamptz null,
  sharing_consent_id uuid null references public.consents (id) on delete set null,
  submitted_at timestamptz null,
  closed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'submitted' or submitted_at is not null)
);

create index cases_patient_idx on public.cases (patient_id, created_at desc);

create table public.case_services (
  case_id uuid not null references public.cases (id) on delete cascade,
  service_id uuid not null references public.services (id),
  suggested_by_ai boolean not null default false,
  confirmed_at timestamptz not null default now(),
  primary key (case_id, service_id)
);

create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null unique references public.cases (id) on delete cascade,
  patient_id uuid not null references public.patients (id) on delete cascade,
  status public.conversation_status not null default 'active',
  user_message_count integer not null default 0 check (user_message_count between 0 and 30),
  ai_consent_id uuid not null references public.consents (id) on delete cascade,
  prompt_version text null check (char_length(prompt_version) <= 40),
  model text null check (char_length(model) <= 80),
  created_at timestamptz not null default now()
);

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations (id) on delete cascade,
  patient_id uuid not null references public.patients (id) on delete cascade,
  role public.ai_message_role not null,
  content text not null check (char_length(content) between 1 and 2000),
  preliminary_assessment text null check (char_length(preliminary_assessment) <= 2000),
  suggested_service_ids uuid[] not null default '{}',
  emergency boolean not null default false,
  out_of_scope public.out_of_scope_topic[] not null default '{}',
  blocked boolean not null default false,
  ready_for_summary boolean not null default false,
  created_at timestamptz not null default now(),
  check (role = 'assistant' or char_length(content) <= 1000),
  check (
    role = 'assistant'
    or (preliminary_assessment is null and suggested_service_ids = '{}' and not emergency
        and out_of_scope = '{}' and not blocked and not ready_for_summary)
  )
);

create index ai_messages_conversation_idx on public.ai_messages (conversation_id, created_at);
create index ai_messages_patient_user_day_idx on public.ai_messages (patient_id, created_at) where role = 'user';

-- Lofter og tællere (7.6). Ingen brugeradgang; kun funktioner.
create table public.ai_limits (
  key text primary key check (char_length(key) between 1 and 60),
  value integer not null check (value > 0)
);

insert into public.ai_limits (key, value) values
  ('anon_daily_ai_calls', 300),
  ('summary_generations_per_case', 5),
  ('summary_generations_per_case_anonymous', 3),
  ('summary_generations_per_patient_day', 20);

create table public.ai_usage_daily (
  day date primary key,
  anonymous_calls integer not null default 0 check (anonymous_calls >= 0)
);

create table public.ai_patient_usage_daily (
  patient_id uuid not null references public.patients (id) on delete cascade,
  day date not null,
  summary_generations integer not null default 0 check (summary_generations >= 0),
  primary key (patient_id, day)
);

-- Hjælpefunktioner
create function public.is_case_owner(p_case_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.cases c where c.id = p_case_id and c.patient_id = (select auth.uid()));
$$;

create function public.ai_limit(p_key text)
returns integer
language sql stable security definer set search_path = ''
as $$ select l.value from public.ai_limits l where l.key = p_key; $$;

create function public.patient_user_messages_last_day()
returns integer
language sql stable security definer set search_path = ''
as $$
  select count(*)::integer from public.ai_messages m
   where m.patient_id = (select auth.uid()) and m.role = 'user' and m.created_at > now() - interval '1 day';
$$;

-- cases_guard(): beskyttede felter ændres kun af funktionerne (transaktionsflag tm.system) og defaults ved insert.
create function public.cases_guard()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_system boolean := coalesce(current_setting('tm.system', true), '') = 'on';
  v_anonymous boolean;
begin
  if tg_op = 'INSERT' then
    if not v_system and (
         new.status <> 'draft' or new.ai_summary is not null or new.ai_model is not null
      or new.ai_prompt_version is not null or new.ai_generation_count <> 0 or new.summary_text is not null
      or new.summary_ai_assisted or new.summary_approved_at is not null or new.sharing_consent_id is not null
      or new.submitted_at is not null or new.closed_at is not null
    ) then
      raise exception 'Feltet ændres kun af systemet' using errcode = '42501';
    end if;
    select p.is_anonymous into v_anonymous from public.profiles p where p.id = new.patient_id;
    if coalesce(v_anonymous, false) then
      if new.is_emergency then
        raise exception 'ACCOUNT_REQUIRED' using errcode = '42501';
      end if;
      if exists (select 1 from public.cases c where c.patient_id = new.patient_id and c.status = 'draft') then
        raise exception 'DRAFT_LIMIT' using errcode = 'P0001';
      end if;
    end if;
    return new;
  end if;

  if new.id is distinct from old.id or new.patient_id is distinct from old.patient_id
     or new.is_emergency is distinct from old.is_emergency or new.created_at is distinct from old.created_at then
    raise exception 'Feltet kan ikke ændres' using errcode = '42501';
  end if;
  if not v_system and (
       new.status is distinct from old.status
    or new.ai_summary is distinct from old.ai_summary
    or new.ai_model is distinct from old.ai_model
    or new.ai_prompt_version is distinct from old.ai_prompt_version
    or new.ai_generation_count is distinct from old.ai_generation_count
    or new.summary_text is distinct from old.summary_text
    or new.summary_ai_assisted is distinct from old.summary_ai_assisted
    or new.summary_approved_at is distinct from old.summary_approved_at
    or new.sharing_consent_id is distinct from old.sharing_consent_id
    or new.submitted_at is distinct from old.submitted_at
    or new.closed_at is distinct from old.closed_at
  ) then
    raise exception 'Feltet ændres kun af systemet' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger cases_guard
  before insert or update on public.cases
  for each row execute function public.cases_guard();

-- Max 5 bekræftede ydelser pr. sag.
create function public.case_services_before_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform 1 from public.cases c where c.id = new.case_id for update;
  if (select count(*) from public.case_services s where s.case_id = new.case_id) >= 5 then
    raise exception 'SERVICE_LIMIT' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger case_services_before_insert
  before insert on public.case_services
  for each row execute function public.case_services_before_insert();

-- ai_conversations: kun status active -> closed og tæller +1, ellers uforanderlig.
create function public.ai_conversations_before_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.id is distinct from old.id or new.case_id is distinct from old.case_id
     or new.patient_id is distinct from old.patient_id or new.ai_consent_id is distinct from old.ai_consent_id then
    raise exception 'Feltet kan ikke ændres' using errcode = '42501';
  end if;
  if new.user_message_count < old.user_message_count or new.user_message_count > old.user_message_count + 1 then
    raise exception 'Ugyldig tæller' using errcode = '42501';
  end if;
  if old.status = 'closed' and new.status = 'active' then
    raise exception 'En lukket samtale kan ikke genåbnes' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger ai_conversations_before_update
  before update on public.ai_conversations
  for each row execute function public.ai_conversations_before_update();

-- Samtalen skal høre til sagens patient.
create function public.ai_conversations_before_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.cases c where c.id = new.case_id and c.patient_id = new.patient_id) then
    raise exception 'Sagen tilhører ikke patienten' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger ai_conversations_before_insert
  before insert on public.ai_conversations
  for each row execute function public.ai_conversations_before_insert();

-- Tidsstemplet sættes af databasen, uanset hvad klienten sender (M4).
create function public.ai_messages_before_insert()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.created_at := now();
  return new;
end;
$$;

create trigger ai_messages_before_insert
  before insert on public.ai_messages
  for each row execute function public.ai_messages_before_insert();
revoke all on function public.ai_messages_before_insert() from public, anon, authenticated;

-- Hver besked nulstiller godkendelsen af opsummeringen (kladde), og brugerbeskeder tælles; ved 30 lukkes samtalen.
create function public.ai_messages_after_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_case_id uuid;
begin
  if new.role = 'user' then
    update public.ai_conversations
       set user_message_count = user_message_count + 1,
           status = case when user_message_count + 1 >= 30 then 'closed'::public.conversation_status else status end
     where id = new.conversation_id
    returning case_id into v_case_id;
  else
    select c.case_id into v_case_id from public.ai_conversations c where c.id = new.conversation_id;
  end if;
  perform set_config('tm.system', 'on', true);
  update public.cases
     set summary_approved_at = null
   where id = v_case_id and status = 'draft' and summary_approved_at is not null;
  perform set_config('tm.system', '', true);
  return null;
end;
$$;

create trigger ai_messages_after_insert
  after insert on public.ai_messages
  for each row execute function public.ai_messages_after_insert();

-- approve_summary(): eneste vej til summary_text.
create function public.approve_summary(p_case_id uuid, p_summary_text text)
returns timestamptz
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_case public.cases%rowtype;
  v_at timestamptz := now();
begin
  if v_uid is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;
  if p_summary_text is null or char_length(btrim(p_summary_text)) = 0 or char_length(p_summary_text) > 1500 then
    raise exception 'INVALID_SUMMARY' using errcode = '22023';
  end if;
  select * into v_case from public.cases where id = p_case_id and patient_id = v_uid for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_case.status <> 'draft' then
    raise exception 'NOT_DRAFT' using errcode = 'P0001';
  end if;
  perform set_config('tm.system', 'on', true);
  update public.cases set summary_text = p_summary_text, summary_approved_at = v_at where id = p_case_id;
  perform set_config('tm.system', '', true);
  return v_at;
end;
$$;

-- store_ai_summary(): kun service role. Ingen auth.uid(); ejerskab tjekkes mod p_user_id.
create function public.store_ai_summary(
  p_user_id uuid, p_case_id uuid, p_summary jsonb, p_ai_assisted boolean, p_model text, p_prompt_version text
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_case public.cases%rowtype;
begin
  select * into v_case from public.cases where id = p_case_id and patient_id = p_user_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_case.status <> 'draft' then
    raise exception 'NOT_DRAFT' using errcode = 'P0001';
  end if;
  perform set_config('tm.system', 'on', true);
  update public.cases
     set ai_summary = p_summary, summary_ai_assisted = coalesce(p_ai_assisted, false),
         ai_model = p_model, ai_prompt_version = p_prompt_version
   where id = p_case_id;
  perform set_config('tm.system', '', true);
end;
$$;

-- append_assistant_message(): kun service role. Ingen auth.uid().
create function public.append_assistant_message(
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
  select * into v_conv from public.ai_conversations where id = p_conversation_id and patient_id = p_user_id;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_conv.status <> 'active' then
    raise exception 'CONVERSATION_CLOSED' using errcode = 'P0001';
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

-- try_consume_anonymous_ai_call(): kun service role (og consume_summary_generation som ejer).
create function public.try_consume_anonymous_ai_call(p_user_id uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_ok boolean;
  v_cap integer := public.ai_limit('anon_daily_ai_calls');
begin
  if v_cap is null or p_user_id is null then
    return false;
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_user_id and p.is_anonymous) then
    return false;
  end if;
  insert into public.ai_usage_daily as u (day, anonymous_calls)
  values ((now() at time zone 'utc')::date, 1)
  on conflict (day) do update set anonymous_calls = u.anonymous_calls + 1 where u.anonymous_calls < v_cap
  returning true into v_ok;
  return coalesce(v_ok, false);
end;
$$;

-- consume_summary_generation(): én transaktion; det globale anonyme loft forbruges kun, hvis de øvrige tjek går igennem.
create function public.consume_summary_generation(p_case_id uuid)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_case public.cases%rowtype;
  v_anonymous boolean;
  v_per_case integer;
  v_per_day integer := public.ai_limit('summary_generations_per_patient_day');
  v_day date := (now() at time zone 'utc')::date;
  v_ok boolean;
  v_count integer;
begin
  if v_uid is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;
  select * into v_case from public.cases where id = p_case_id and patient_id = v_uid for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_case.status <> 'draft' then
    raise exception 'NOT_DRAFT' using errcode = 'P0001';
  end if;
  select p.is_anonymous into v_anonymous from public.profiles p where p.id = v_uid;
  v_per_case := case when coalesce(v_anonymous, false)
                     then public.ai_limit('summary_generations_per_case_anonymous')
                     else public.ai_limit('summary_generations_per_case') end;
  if v_case.ai_generation_count >= v_per_case then
    raise exception 'SUMMARY_LIMIT' using errcode = 'P0001';
  end if;
  insert into public.ai_patient_usage_daily as u (patient_id, day, summary_generations)
  values (v_uid, v_day, 1)
  on conflict (patient_id, day) do update set summary_generations = u.summary_generations + 1
    where u.summary_generations < v_per_day
  returning true into v_ok;
  if v_ok is null then
    raise exception 'DAILY_SUMMARY_LIMIT' using errcode = 'P0001';
  end if;
  if coalesce(v_anonymous, false) and not public.try_consume_anonymous_ai_call(v_uid) then
    raise exception 'ANON_CAP_REACHED' using errcode = 'P0001';
  end if;
  perform set_config('tm.system', 'on', true);
  update public.cases set ai_generation_count = ai_generation_count + 1 where id = p_case_id
  returning ai_generation_count into v_count;
  perform set_config('tm.system', '', true);
  return v_per_case - v_count;
end;
$$;

-- Rettigheder
revoke all on function public.is_case_owner(uuid) from public, anon;
revoke all on function public.ai_limit(text) from public, anon;
revoke all on function public.patient_user_messages_last_day() from public, anon;
grant execute on function public.is_case_owner(uuid) to authenticated, service_role;
grant execute on function public.ai_limit(text) to authenticated, service_role;
grant execute on function public.patient_user_messages_last_day() to authenticated, service_role;

revoke all on function public.cases_guard() from public, anon, authenticated;
revoke all on function public.case_services_before_insert() from public, anon, authenticated;
revoke all on function public.ai_conversations_before_update() from public, anon, authenticated;
revoke all on function public.ai_conversations_before_insert() from public, anon, authenticated;
revoke all on function public.ai_messages_after_insert() from public, anon, authenticated;

revoke all on function public.approve_summary(uuid, text) from public, anon;
revoke all on function public.consume_summary_generation(uuid) from public, anon;
grant execute on function public.approve_summary(uuid, text) to authenticated;
grant execute on function public.consume_summary_generation(uuid) to authenticated;

revoke all on function public.store_ai_summary(uuid, uuid, jsonb, boolean, text, text) from public, anon, authenticated;
revoke all on function public.append_assistant_message(uuid, uuid, text, text, uuid[], boolean, text[], boolean, boolean) from public, anon, authenticated;
revoke all on function public.try_consume_anonymous_ai_call(uuid) from public, anon, authenticated;
grant execute on function public.store_ai_summary(uuid, uuid, jsonb, boolean, text, text) to service_role;
grant execute on function public.append_assistant_message(uuid, uuid, text, text, uuid[], boolean, text[], boolean, boolean) to service_role;
grant execute on function public.try_consume_anonymous_ai_call(uuid) to service_role;

-- RLS
alter table public.cases enable row level security;
alter table public.case_services enable row level security;
alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;
alter table public.ai_limits enable row level security;
alter table public.ai_usage_daily enable row level security;
alter table public.ai_patient_usage_daily enable row level security;
-- ai_limits, ai_usage_daily, ai_patient_usage_daily: ingen policies (kun funktioner).
revoke all on public.ai_limits, public.ai_usage_daily, public.ai_patient_usage_daily from authenticated;

create policy cases_select_own on public.cases
  for select to authenticated using (patient_id = (select auth.uid()));
create policy cases_insert_own on public.cases
  for insert to authenticated with check (patient_id = (select auth.uid()) and status = 'draft');
create policy cases_update_own_draft on public.cases
  for update to authenticated
  using (patient_id = (select auth.uid()) and status = 'draft')
  with check (patient_id = (select auth.uid()));
-- Ingen DELETE for authenticated: kladder slettes af serveren (service role), som også rydder billedfilerne (M5).
revoke insert, update, delete, truncate on public.cases from authenticated;
grant insert (patient_id, is_emergency, postal_code, preferred_timeframe) on public.cases to authenticated;
grant update (postal_code, preferred_timeframe) on public.cases to authenticated;

create policy case_services_select_own on public.case_services
  for select to authenticated using (public.is_case_owner(case_id));
create policy case_services_insert_own on public.case_services
  for insert to authenticated
  with check (
    public.is_case_owner(case_id)
    and exists (select 1 from public.cases c where c.id = case_id and c.status = 'draft')
    and exists (select 1 from public.services s where s.id = service_id and s.is_active)
  );
create policy case_services_delete_own on public.case_services
  for delete to authenticated
  using (public.is_case_owner(case_id) and exists (select 1 from public.cases c where c.id = case_id and c.status = 'draft'));
revoke update, truncate on public.case_services from authenticated;

create policy ai_conversations_select_own on public.ai_conversations
  for select to authenticated using (patient_id = (select auth.uid()));
create policy ai_conversations_insert_own on public.ai_conversations
  for insert to authenticated
  with check (
    patient_id = (select auth.uid())
    and public.is_case_owner(case_id)
    and status = 'active' and user_message_count = 0
    and exists (select 1 from public.cases c where c.id = case_id and c.status = 'draft')
    and exists (
      select 1 from public.consents k
       where k.id = ai_consent_id and k.patient_id = (select auth.uid())
         and k.type = 'ai_processing' and k.withdrawn_at is null
    )
    and public.has_active_consent('ai_processing')
  );
revoke update, delete, truncate on public.ai_conversations from authenticated;

create policy ai_messages_select_own on public.ai_messages
  for select to authenticated using (patient_id = (select auth.uid()));
create policy ai_messages_insert_own_user on public.ai_messages
  for insert to authenticated
  with check (
    role = 'user'
    and patient_id = (select auth.uid())
    and exists (
      select 1 from public.ai_conversations c
       where c.id = conversation_id and c.patient_id = (select auth.uid())
         and c.status = 'active' and c.user_message_count < 30
    )
    and public.has_active_consent('ai_processing')
    and public.patient_user_messages_last_day() < 100
  );
revoke update, delete, truncate on public.ai_messages from authenticated;
