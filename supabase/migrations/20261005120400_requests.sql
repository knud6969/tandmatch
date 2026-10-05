-- Trin 2: forespørgsler (kosmetisk spor) og modtagere (matching).
-- Jf. docs/architecture.md 4.3, 5.2, 5.4. Modtagere oprettes KUN af send_request() (migration 120700).

create type public.request_status as enum ('draft', 'sent', 'closed', 'expired');
create type public.recipient_status as enum ('new', 'seen', 'responded', 'declined');

create table public.requests (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  category public.cosmetic_category not null,
  answers jsonb not null default '{}'::jsonb
    check (jsonb_typeof(answers) = 'object' and octet_length(answers::text) <= 8000),
  questions_version text not null check (char_length(questions_version) between 1 and 40),
  free_text text null check (free_text is null or char_length(free_text) <= 2000),
  postal_code text null check (postal_code is null or postal_code ~ '^[0-9]{4}$'),
  max_distance_km integer not null default 25 check (max_distance_km between 1 and 100),
  ai_summary jsonb null check (ai_summary is null or octet_length(ai_summary::text) <= 16000),
  ai_model text null check (ai_model is null or char_length(ai_model) <= 80),
  ai_prompt_version text null check (ai_prompt_version is null or char_length(ai_prompt_version) <= 40),
  ai_generation_count integer not null default 0 check (ai_generation_count between 0 and 5),
  summary_text text null check (summary_text is null or char_length(summary_text) <= 1500),
  summary_ai_assisted boolean not null default false,
  summary_approved_at timestamptz null,
  sharing_consent_id uuid null references public.consents (id) on delete set null,
  status public.request_status not null default 'draft',
  sent_at timestamptz null,
  expires_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status = 'draft' or (sent_at is not null and expires_at is not null))
);

create index requests_patient_idx on public.requests (patient_id, created_at desc);

create table public.request_recipients (
  request_id uuid not null references public.requests (id) on delete cascade,
  dentist_id uuid not null references public.dentists (id) on delete cascade,
  status public.recipient_status not null default 'new',
  distance_km numeric(6, 2) not null check (distance_km >= 0),
  seen_at timestamptz null,
  created_at timestamptz not null default now(),
  primary key (request_id, dentist_id)
);

create index request_recipients_dentist_idx on public.request_recipients (dentist_id);

-- Hjælpefunktioner: kun boolean, fast search_path, ingen rækker returneres.
create or replace function public.is_request_owner(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.requests r
    where r.id = p_request_id and r.patient_id = (select auth.uid())
  );
$$;

-- En tandlæge er modtager, når forespørgslen er sendt (ikke kladde).
create or replace function public.is_request_recipient(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.request_recipients rr
    join public.requests r on r.id = rr.request_id
    where rr.request_id = p_request_id
      and rr.dentist_id = (select auth.uid())
      and r.status <> 'draft'
  );
$$;

-- Tekst-varianter til storage-policies (mappenavn er tekst). Ugyldigt uuid giver false, aldrig en fejl.
create or replace function public.is_request_owner_text(p_request_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_request_id is null or p_request_id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return false;
  end if;
  return public.is_request_owner(p_request_id::uuid);
end;
$$;

create or replace function public.is_request_recipient_text(p_request_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_request_id is null or p_request_id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return false;
  end if;
  return public.is_request_recipient(p_request_id::uuid);
end;
$$;

-- Triggers på requests. Status og afsendelsesfelter kan kun ændres af send_request() (sætter tm.transition).
create or replace function public.requests_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'draft' then
    raise exception 'Ny forespørgsel skal være kladde' using errcode = '42501';
  end if;
  -- Anonyme patienter har højst én kladde (architecture 6.2, 10.4).
  if exists (select 1 from public.profiles p where p.id = new.patient_id and p.is_anonymous)
     and exists (select 1 from public.requests r where r.patient_id = new.patient_id) then
    raise exception 'ANON_DRAFT_LIMIT' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger requests_before_insert
  before insert on public.requests
  for each row execute function public.requests_before_insert();

create or replace function public.requests_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.id is distinct from old.id or new.patient_id is distinct from old.patient_id then
    raise exception 'Feltet kan ikke ændres' using errcode = '42501';
  end if;

  if (new.status, new.sent_at, new.expires_at, new.sharing_consent_id)
     is distinct from (old.status, old.sent_at, old.expires_at, old.sharing_consent_id)
     and coalesce(current_setting('tm.transition', true), '') <> 'on' then
    raise exception 'Forespørgslens status ændres kun af systemet' using errcode = '42501';
  end if;

  -- Ændres indholdet efter godkendelse, nulstilles godkendelsen (architecture 4.3).
  if (new.category, new.answers, new.free_text, new.max_distance_km)
     is distinct from (old.category, old.answers, old.free_text, old.max_distance_km) then
    new.summary_approved_at := null;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger requests_before_update
  before update on public.requests
  for each row execute function public.requests_before_update();

-- RLS: requests
alter table public.requests enable row level security;

create policy requests_select_owner_or_recipient on public.requests
  for select
  using (patient_id = (select auth.uid()) or public.is_request_recipient(id));

create policy requests_insert_own_draft on public.requests
  for insert
  with check (
    patient_id = (select auth.uid())
    and public.auth_role() = 'patient'
    and status = 'draft'
    and sent_at is null
    and sharing_consent_id is null
    and summary_approved_at is null
  );

create policy requests_update_own_draft on public.requests
  for update
  using (patient_id = (select auth.uid()) and status = 'draft')
  with check (patient_id = (select auth.uid()) and status = 'draft');

create policy requests_delete_own_draft on public.requests
  for delete
  using (patient_id = (select auth.uid()) and status = 'draft');

-- RLS: request_recipients. Kun læsning. Oprettelse sker kun i send_request(). Tandlægens statusopdatering kommer i trin 3.
alter table public.request_recipients enable row level security;

create policy request_recipients_select on public.request_recipients
  for select
  using (dentist_id = (select auth.uid()) or public.is_request_owner(request_id));
