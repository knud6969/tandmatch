-- Del 8: leads og beskedtråd pr. lead (architecture 4.3, 5.2, 5.4, 5.5).
-- Leads oprettes kun af send_leads() og ændres kun af funktionerne i 000800.
-- Klinikker har SELECT på egne leads, men ingen patientidentitet findes på rækken.

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  clinic_id uuid not null references public.clinics (id),
  status public.lead_status not null default 'sent',
  distance_km numeric null check (distance_km is null or distance_km >= 0),
  list_price_min integer null check (list_price_min >= 0),
  list_price_max integer null,
  requested_service_id uuid null references public.services (id),
  requested_starts_at timestamptz null,
  seen_at timestamptz null,
  responded_at timestamptz null,
  clinic_comment text null check (char_length(clinic_comment) <= 500),
  quoted_price_min integer null check (quoted_price_min >= 0),
  quoted_price_max integer null,
  decline_reason public.lead_decline_reason null,
  decline_note text null check (char_length(decline_note) <= 200),
  sent_at timestamptz not null default now(),
  withdrawn_at timestamptz null,
  created_at timestamptz not null default now(),
  unique (case_id, clinic_id),
  check ((list_price_min is null) = (list_price_max is null) and (list_price_min is null or list_price_max >= list_price_min)),
  check ((quoted_price_min is null) = (quoted_price_max is null) and (quoted_price_min is null or quoted_price_max >= quoted_price_min)),
  check ((requested_service_id is null) = (requested_starts_at is null)),
  check (status <> 'declined' or decline_reason is not null),
  check (status <> 'withdrawn' or withdrawn_at is not null)
);

create index leads_clinic_idx on public.leads (clinic_id, sent_at desc);
create index leads_case_idx on public.leads (case_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  read_at timestamptz null,
  created_at timestamptz not null default now()
);

create index messages_lead_idx on public.messages (lead_id, created_at);

-- Hjælpefunktioner (5.2)
create function public.is_lead_active_status(p_status public.lead_status)
returns boolean
language sql immutable set search_path = ''
as $$ select p_status in ('sent', 'accepted', 'booked'); $$;

-- Deltager = ejer af sagen ELLER ejer af leadets klinik, når leadet ikke er trukket tilbage (beslutning 20).
-- Klinikken skal desuden være 'verified' (5.7: leads kræver verifikation). Uden det kunne en, der overtager en
-- importeret klinik via CVR (signup, [PROTOTYPE]) efter at den tidligere ejer har slettet sin konto, læse den
-- tidligere ejers beskedtråde med patienter og skrive til dem (security 0.7, kritisk fund).
create function public.is_lead_participant(p_lead_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
      from public.leads l
      join public.cases c on c.id = l.case_id
      join public.clinics k on k.id = l.clinic_id
     where l.id = p_lead_id
       and (c.patient_id = (select auth.uid())
            or (l.status <> 'withdrawn' and k.owner_id = (select auth.uid()) and k.status = 'verified'
                and l.sent_at >= k.owner_since))
  );
$$;

-- Er den indloggede bruger patienten på leadets sag? (Klinikker har ikke SELECT på messages; se clinic_lead_messages.)
create function public.is_lead_patient(p_lead_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.leads l join public.cases c on c.id = l.case_id
     where l.id = p_lead_id and c.patient_id = (select auth.uid())
  );
$$;

-- Er leadet sendt til den indloggede, verificerede ejers klinik, efter at ejeren overtog den (H2, M1)?
-- Tager ikke stilling til withdrawn; kaldere tilføjer selv det.
create function public.is_my_clinic_lead(p_lead_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.leads l join public.clinics k on k.id = l.clinic_id
     where l.id = p_lead_id and k.owner_id = (select auth.uid()) and k.status = 'verified'
       and l.sent_at >= k.owner_since
  );
$$;

create function public.is_lead_thread_open(p_lead_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.leads l where l.id = p_lead_id and public.is_lead_active_status(l.status));
$$;

create function public.participant_messages_last_day()
returns integer
language sql stable security definer set search_path = ''
as $$
  select count(*)::integer from public.messages m
   where m.sender_id = (select auth.uid()) and m.created_at > now() - interval '1 day';
$$;

-- Lofter pr. sag i databasen: højst 3 aktive og højst 10 leads i alt (beslutning 17).
create function public.leads_before_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform 1 from public.cases c where c.id = new.case_id for update;
  if (select count(*) from public.leads l where l.case_id = new.case_id) >= 10 then
    raise exception 'LEAD_TOTAL_LIMIT' using errcode = 'P0001';
  end if;
  if public.is_lead_active_status(new.status)
     and (select count(*) from public.leads l
           where l.case_id = new.case_id and public.is_lead_active_status(l.status)) >= 3 then
    raise exception 'LEAD_LIMIT' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.clinics k where k.id = new.clinic_id and k.status = 'verified') then
    raise exception 'CLINIC_NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger leads_before_insert
  before insert on public.leads
  for each row execute function public.leads_before_insert();

-- Identitet er uforanderlig; endelige statusser kan ikke forlades.
create function public.leads_before_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.id is distinct from old.id or new.case_id is distinct from old.case_id
     or new.clinic_id is distinct from old.clinic_id or new.sent_at is distinct from old.sent_at then
    raise exception 'Feltet kan ikke ændres' using errcode = '42501';
  end if;
  if old.status in ('declined', 'withdrawn') and new.status is distinct from old.status then
    raise exception 'LEAD_NOT_PENDING' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger leads_before_update
  before update on public.leads
  for each row execute function public.leads_before_update();

create function public.messages_before_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.id is distinct from old.id or new.lead_id is distinct from old.lead_id
     or new.sender_id is distinct from old.sender_id or new.body is distinct from old.body
     or new.created_at is distinct from old.created_at then
    raise exception 'Feltet kan ikke ændres' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger messages_before_update
  before update on public.messages
  for each row execute function public.messages_before_update();

-- clinic_mark_lead_seen(): sætter seen_at første gang den verificerede ejer åbner et ikke-tilbagetrukket lead.
create function public.clinic_mark_lead_seen(p_lead_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.leads l
     set seen_at = now()
    from public.clinics k
   where l.id = p_lead_id and k.id = l.clinic_id and k.owner_id = (select auth.uid())
     and k.status = 'verified' and l.sent_at >= k.owner_since and l.status <> 'withdrawn' and l.seen_at is null;
end;
$$;

-- clinic_mark_messages_read(): klinikken markerer patientens beskeder i en tråd som læst. Klinikken har hverken
-- SELECT eller UPDATE på messages (sender_id ville afsløre patient_id), så det sker her.
create function public.clinic_mark_messages_read(p_lead_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_my_clinic_lead(p_lead_id) then
    return;
  end if;
  update public.messages m
     set read_at = now()
    from public.leads l
   where m.lead_id = p_lead_id and l.id = m.lead_id and l.status <> 'withdrawn'
     and m.sender_id <> (select auth.uid()) and m.read_at is null;
end;
$$;

-- Tidsstempler på beskeder sættes af databasen, uanset hvad klienten sender (M4).
create function public.messages_before_insert()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.created_at := now();
  new.read_at := null;
  return new;
end;
$$;

create trigger messages_before_insert
  before insert on public.messages
  for each row execute function public.messages_before_insert();

revoke all on function public.is_lead_active_status(public.lead_status) from public, anon;
revoke all on function public.is_lead_participant(uuid) from public, anon;
revoke all on function public.is_lead_thread_open(uuid) from public, anon;
revoke all on function public.participant_messages_last_day() from public, anon;
revoke all on function public.clinic_mark_lead_seen(uuid) from public, anon;
revoke all on function public.is_lead_patient(uuid) from public, anon;
revoke all on function public.is_my_clinic_lead(uuid) from public, anon;
revoke all on function public.clinic_mark_messages_read(uuid) from public, anon;
revoke all on function public.messages_before_insert() from public, anon, authenticated;
grant execute on function public.is_lead_patient(uuid) to authenticated, service_role;
grant execute on function public.is_my_clinic_lead(uuid) to authenticated, service_role;
grant execute on function public.clinic_mark_messages_read(uuid) to authenticated;
grant execute on function public.is_lead_active_status(public.lead_status) to authenticated, service_role;
grant execute on function public.is_lead_participant(uuid) to authenticated, service_role;
grant execute on function public.is_lead_thread_open(uuid) to authenticated, service_role;
grant execute on function public.participant_messages_last_day() to authenticated, service_role;
grant execute on function public.clinic_mark_lead_seen(uuid) to authenticated;
revoke all on function public.leads_before_insert() from public, anon, authenticated;
revoke all on function public.leads_before_update() from public, anon, authenticated;
revoke all on function public.messages_before_update() from public, anon, authenticated;

alter table public.leads enable row level security;
alter table public.messages enable row level security;

-- leads: præcis to veje ind (5.5). Ingen skrivning for authenticated.
create policy leads_select_case_owner_or_clinic on public.leads
  for select to authenticated using (public.is_case_owner(case_id) or public.is_my_clinic_lead(id));
revoke insert, update, delete, truncate on public.leads from authenticated;

-- Kun patienten har SELECT. Klinikken læser tråden via clinic_lead_messages() uden sender_id (H1).
create policy messages_select_patient on public.messages
  for select to authenticated using (public.is_lead_patient(lead_id));
create policy messages_insert_participant on public.messages
  for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and public.is_permanent_user()
    and public.is_lead_participant(lead_id)
    and public.is_lead_thread_open(lead_id)
    and public.participant_messages_last_day() < 200
  );
create policy messages_update_mark_read on public.messages
  for update to authenticated
  using (public.is_lead_patient(lead_id) and sender_id <> (select auth.uid()))
  with check (public.is_lead_patient(lead_id) and sender_id <> (select auth.uid()));
revoke delete, truncate on public.messages from authenticated;
revoke update on public.messages from authenticated;
grant update (read_at) on public.messages to authenticated;
