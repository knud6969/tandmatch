-- Trin 2: AI-chat. Én samtale pr. forespørgsel, kun synlig for patienten (architecture 4.3, 5.4, 7.6).
-- Lofter håndhæves i databasen (triggers og policies), ikke kun i API.

create type public.conversation_status as enum ('active', 'closed');
create type public.ai_message_role as enum ('user', 'assistant');
create type public.out_of_scope_topic as enum ('diagnosis', 'severity', 'treatment', 'price');

create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.requests (id) on delete cascade,
  patient_id uuid not null references public.patients (id) on delete cascade,
  status public.conversation_status not null default 'active',
  user_message_count integer not null default 0 check (user_message_count between 0 and 30),
  ai_consent_id uuid not null references public.consents (id) on delete cascade,
  prompt_version text null check (prompt_version is null or char_length(prompt_version) <= 40),
  model text null check (model is null or char_length(model) <= 80),
  created_at timestamptz not null default now()
);

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations (id) on delete cascade,
  patient_id uuid not null references public.patients (id) on delete cascade,
  role public.ai_message_role not null,
  content text not null check (char_length(content) between 1 and 2000),
  out_of_scope public.out_of_scope_topic[] not null default '{}',
  blocked boolean not null default false,
  ready_for_summary boolean not null default false,
  created_at timestamptz not null default now(),
  check (role = 'assistant' or char_length(content) <= 1000)
);

create index ai_messages_conversation_idx on public.ai_messages (conversation_id, created_at);
create index ai_messages_patient_user_day_idx on public.ai_messages (patient_id, created_at) where role = 'user';

-- Guard: samtalens felter ændres kun som tilladt (tæller +1, status active -> closed).
create or replace function public.ai_conversations_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
     or new.request_id is distinct from old.request_id
     or new.patient_id is distinct from old.patient_id
     or new.ai_consent_id is distinct from old.ai_consent_id then
    raise exception 'Feltet kan ikke ændres' using errcode = '42501';
  end if;
  if new.user_message_count < old.user_message_count
     or new.user_message_count > old.user_message_count + 1 then
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

-- Hver patientbesked tæller op i samtalen. Ved 30 lukkes samtalen (architecture 7.6).
create or replace function public.ai_messages_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role = 'user' then
    update public.ai_conversations
       set user_message_count = user_message_count + 1,
           status = case when user_message_count + 1 >= 30 then 'closed'::public.conversation_status else status end
     where id = new.conversation_id;
  end if;
  return null;
end;
$$;

create trigger ai_messages_after_insert
  after insert on public.ai_messages
  for each row execute function public.ai_messages_after_insert();

-- Antal patientbeskeder de seneste 24 timer for den indloggede. Security definer for at undgå rekursion i policies.
create or replace function public.patient_user_messages_last_day()
returns integer
language sql
stable
security definer
set search_path = ''
as $fn$
  select count(*)::integer from public.ai_messages m
  where m.patient_id = (select auth.uid())
    and m.role = 'user'
    and m.created_at > now() - interval '1 day';
$fn$;

-- RLS: kun patienten (ejer) ser og skriver. Tandlæger ser aldrig chatten (architecture 4.4, 5.5).
alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;

create policy ai_conversations_select_own on public.ai_conversations
  for select
  using (patient_id = (select auth.uid()));

create policy ai_conversations_insert_own on public.ai_conversations
  for insert
  with check (
    patient_id = (select auth.uid())
    and public.is_request_owner(request_id)
    and status = 'active'
    and user_message_count = 0
    and exists (
      select 1 from public.requests r
      where r.id = request_id and r.status = 'draft'
    )
    and exists (
      select 1 from public.consents c
      where c.id = ai_consent_id
        and c.patient_id = (select auth.uid())
        and c.type = 'ai_processing'
        and c.withdrawn_at is null
    )
    and public.has_active_consent('ai_processing')
  );
-- Ingen UPDATE-policy for patienter: tællere og status ændres kun af triggeren ovenfor.

create policy ai_messages_select_own on public.ai_messages
  for select
  using (patient_id = (select auth.uid()));

create policy ai_messages_insert_own on public.ai_messages
  for insert
  with check (
    patient_id = (select auth.uid())
    and exists (
      select 1 from public.ai_conversations c
      where c.id = conversation_id
        and c.patient_id = (select auth.uid())
        and c.status = 'active'
        and (role = 'assistant' or c.user_message_count < 30)
    )
    and public.has_active_consent('ai_processing')
    and (role = 'assistant' or public.patient_user_messages_last_day() < 100)
  );
-- Ingen UPDATE/DELETE-policies. Slettes via cascade.
