-- Trin 3: tandlægesvar på kosmetiske forespørgsler (architecture 4.3, 5.2, 5.4, 5.5, 10.6).
-- En række pr. tandlæge og forespørgsel. Tandlæger ser KUN egne svar; patienten ser alle svar på egne forespørgsler.
-- Ingen udkast-status: en oprettet række er sendt (jf. response_status i 4.2). Ændres kun, mens forespørgslen er sendt og ikke udløbet.

create type public.response_status as enum ('sent', 'withdrawn');
create type public.patient_decision as enum ('none', 'chosen', 'declined');

-- Hjælpefunktioner (security definer, fast search_path, kun boolean, kun id som input).
-- is_verified_dentist(): tandlægen er godkendt af admin (4.3). Ikke-verificerede kan ikke svare.
create or replace function public.is_verified_dentist()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.dentists d
    where d.id = (select auth.uid()) and d.is_verified
  );
$$;

-- is_request_open_for_responses(): forespørgslen er sendt og har ikke udløbet (6.6, 10.6).
create or replace function public.is_request_open_for_responses(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.requests r
    where r.id = p_request_id
      and r.status = 'sent'
      and r.expires_at > now()
  );
$$;

create table public.responses (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests (id) on delete cascade,
  dentist_id uuid not null references public.dentists (id) on delete cascade,
  assessment text not null check (char_length(btrim(assessment)) between 1 and 2000),
  price_min integer not null check (price_min >= 0),
  -- Øvre grænse 1.000.000 kr. er en sikkerhedsgrænse ud over architecture 4.3 (0 <= min <= max).
  price_max integer not null check (price_max >= price_min and price_max <= 1000000),
  price_note text null check (price_note is null or char_length(price_note) <= 200),
  first_available_at timestamptz null,
  offer text null check (offer is null or char_length(offer) <= 1000),
  valid_until date null,
  status public.response_status not null default 'sent',
  patient_decision public.patient_decision not null default 'none',
  patient_seen_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint responses_request_dentist_key unique (request_id, dentist_id)
);

create index responses_dentist_idx on public.responses (dentist_id);

-- Guard: identitetsfelter er uforanderlige. Patient-beslutning og sete-tidspunkt sættes kun af systemet
-- (tm.system, fx en senere decide_response()). Status kan kun gå fra sent til withdrawn.
create or replace function public.responses_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
     or new.request_id is distinct from old.request_id
     or new.dentist_id is distinct from old.dentist_id
     or new.created_at is distinct from old.created_at then
    raise exception 'Feltet kan ikke ændres' using errcode = '42501';
  end if;

  if (new.patient_decision is distinct from old.patient_decision
      or new.patient_seen_at is distinct from old.patient_seen_at)
     and coalesce(current_setting('tm.system', true), '') <> 'on' then
    raise exception 'Feltet ændres kun af systemet' using errcode = '42501';
  end if;

  if new.status is distinct from old.status
     and not (old.status = 'sent' and new.status = 'withdrawn') then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger responses_before_update
  before update on public.responses
  for each row execute function public.responses_before_update();

-- Når tandlægen har svaret, markeres modtagelsen som 'responded'. Kører som ejer, så
-- tandlægen ikke behøver UPDATE-rettigheder på request_recipients.
create or replace function public.responses_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.request_recipients rr
     set status = 'responded'
   where rr.request_id = new.request_id
     and rr.dentist_id = new.dentist_id;
  return null;
end;
$$;

create trigger responses_after_insert
  after insert on public.responses
  for each row execute function public.responses_after_insert();

-- RLS: responses
alter table public.responses enable row level security;

-- Læsning: forfatteren (tandlægen selv) eller ejeren af forespørgslen. Ingen andre tandlæger.
create policy responses_select_author_or_owner on public.responses
  for select
  using (
    dentist_id = (select auth.uid())
    or public.is_request_owner(request_id)
  );

-- Oprettelse: verificeret, permanent tandlæge, som er modtager, på en sendt og ikke-udløbet forespørgsel.
create policy responses_insert_recipient on public.responses
  for insert
  with check (
    dentist_id = (select auth.uid())
    and public.auth_role() = 'dentist'
    and public.is_permanent_user()
    and public.is_verified_dentist()
    and public.is_request_recipient(request_id)
    and public.is_request_open_for_responses(request_id)
    and status = 'sent'
    and patient_decision = 'none'
    and patient_seen_at is null
  );

-- Opdatering: kun egen række, kun mens den er 'sent', patienten ikke har truffet valg,
-- og forespørgslen stadig er åben. Efter 'withdrawn' er rækken frossen.
create policy responses_update_author on public.responses
  for update
  using (
    dentist_id = (select auth.uid())
    and public.auth_role() = 'dentist'
    and public.is_verified_dentist()
    and public.is_request_recipient(request_id)
    and public.is_request_open_for_responses(request_id)
    and status = 'sent'
    and patient_decision = 'none'
  )
  with check (
    dentist_id = (select auth.uid())
    and public.auth_role() = 'dentist'
    and public.is_verified_dentist()
    and public.is_request_recipient(request_id)
    and public.is_request_open_for_responses(request_id)
    and patient_decision = 'none'
  );

-- Ingen delete-policy for brugere (sletning sker via cascade fra forespørgsel/konto).
-- Ingen insert/update-policy for patienter (patient_decision sættes af decide_response() i et senere trin).
