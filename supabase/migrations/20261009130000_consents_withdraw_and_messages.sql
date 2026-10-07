-- Byggetrin 6: tilbagetrækning af samtykke og beskedtråd (architecture 5.2, 5.3, 5.4, 7.7, 10.3, 10.7).

-- 1. withdraw_consent(): sætter withdrawn_at, sletter patientens billedrækker (image_upload) og lukker
--    aktive AI-samtaler (ai_processing). Returnerer de slettede filstier, så API'et kan rydde storage
--    i samme kald (architecture 5.3), samt samtykketypen, så API'et kan afgøre anonym sessions-sletning (7.7).
create or replace function public.withdraw_consent(p_consent_id uuid)
returns table (withdrawn_at timestamptz, consent_type public.consent_type, deleted_image_paths text[], closed_conversations integer)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := (select auth.uid());
  v_consent public.consents%rowtype;
  v_at timestamptz := now();
  v_paths text[] := '{}';
  v_closed integer := 0;
begin
  if v_uid is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;

  select * into v_consent from public.consents where id = p_consent_id and patient_id = v_uid for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_consent.withdrawn_at is not null then
    raise exception 'ALREADY_WITHDRAWN' using errcode = 'P0001';
  end if;

  update public.consents set withdrawn_at = v_at where id = p_consent_id;

  if v_consent.type = 'image_upload' then
    with d as (
      delete from public.request_images where patient_id = v_uid returning storage_path
    )
    select coalesce(array_agg(d.storage_path), '{}') into v_paths from d;
  elsif v_consent.type = 'ai_processing' then
    with c as (
      update public.ai_conversations
         set status = 'closed'
       where patient_id = v_uid and status = 'active'
      returning 1
    )
    select count(*) into v_closed from c;
  end if;

  return query select v_at, v_consent.type, v_paths, v_closed;
end;
$fn$;

revoke all on function public.withdraw_consent(uuid) from public, anon;
grant execute on function public.withdraw_consent(uuid) to authenticated;

-- 2. Beskedtråd. En tråd hænger på ét svar: altid præcis én patient og én tandlæge (architecture 4.3, 10.7).
create or replace function public.is_response_participant(p_response_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select exists (
    select 1 from public.responses r
    where r.id = p_response_id
      and (r.dentist_id = (select auth.uid()) or public.is_request_owner(r.request_id))
  );
$fn$;

revoke all on function public.is_response_participant(uuid) from public, anon;
grant execute on function public.is_response_participant(uuid) to authenticated;

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null references public.responses (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  read_at timestamptz null,
  created_at timestamptz not null default now()
);

create index messages_response_idx on public.messages (response_id, created_at);

-- Dagligt loft pr. afsender, for at undgå misbrug af tråden (ingen tilsvarende grænse i architecture 10.7;
-- tilføjet som værn, samme mønster som patient_user_messages_last_day()).
create or replace function public.participant_messages_last_day()
returns integer
language sql
stable
security definer
set search_path = ''
as $fn$
  select count(*)::integer
  from public.messages m
  where m.sender_id = (select auth.uid())
    and m.created_at > now() - interval '1 day';
$fn$;

revoke all on function public.participant_messages_last_day() from public, anon;
grant execute on function public.participant_messages_last_day() to authenticated;

-- Guard: identitet og indhold er uforanderlige. Kun read_at kan sættes, og kun af den anden part (modtageren).
create or replace function public.messages_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if new.id is distinct from old.id
     or new.response_id is distinct from old.response_id
     or new.sender_id is distinct from old.sender_id
     or new.body is distinct from old.body
     or new.created_at is distinct from old.created_at then
    raise exception 'Feltet kan ikke ændres' using errcode = '42501';
  end if;
  return new;
end;
$fn$;

create trigger messages_before_update
  before update on public.messages
  for each row execute function public.messages_before_update();

alter table public.messages enable row level security;

-- Kun de to parter i den pågældende response kan læse (ingen andre tandlæger eller patienter).
create policy messages_select_participant on public.messages
  for select
  using (public.is_response_participant(response_id));

create policy messages_insert_participant on public.messages
  for insert
  with check (
    sender_id = (select auth.uid())
    and public.is_permanent_user()
    and public.is_response_participant(response_id)
    and public.participant_messages_last_day() < 200
  );

-- Modtageren markerer afsenderens beskeder som læst. Andre feltændringer blokeres af triggeren ovenfor.
create policy messages_update_mark_read on public.messages
  for update
  using (public.is_response_participant(response_id))
  with check (
    public.is_response_participant(response_id)
    and sender_id is distinct from (select auth.uid())
  );
