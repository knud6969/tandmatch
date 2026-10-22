-- Trin 5.2 (security L6, architecture 4.3 `messages`, 12.3 punkt 30): klinikkens beskeder bevares i patientens tråd,
-- når klinikkontoen slettes.
--   * messages.sender_id bliver nullable med `on delete set null` (var `on delete cascade`).
--   * ny enum message_sender_role og kolonne sender_role not null ('patient' | 'clinic'); afgør fromMe og visningen
--     ("Klinikken"), også når sender_id er null. Eksisterende rækker får rollen fra afsenderens profil.
--   * sender_role sættes af databasen ved indsættelse (trigger) ud fra afsenderen: er afsenderen sagens patient,
--     er rollen 'patient', ellers 'clinic'. En klient kan ikke forfalske den: en afvigende værdi afvises.
--   * clinic_leads(), clinic_lead_messages() og clinic_mark_messages_read() bruger sender_role i stedet for sender_id.

create type public.message_sender_role as enum ('patient', 'clinic');

alter table public.messages add column sender_role public.message_sender_role null;

update public.messages m
   set sender_role = case when p.role = 'clinic' then 'clinic'::public.message_sender_role
                          else 'patient'::public.message_sender_role end
  from public.profiles p
 where p.id = m.sender_id;

alter table public.messages alter column sender_role set not null;

alter table public.messages alter column sender_id drop not null;
alter table public.messages drop constraint messages_sender_id_fkey;
alter table public.messages
  add constraint messages_sender_id_fkey foreign key (sender_id) references public.profiles (id) on delete set null;

-- Sætter tidsstempler (M4) og afsenderrollen. Security definer, fordi en klinik ikke kan læse leads og sager direkte.
create or replace function public.messages_before_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_role public.message_sender_role;
begin
  new.created_at := now();
  new.read_at := null;
  if new.sender_id is null then
    raise exception 'Afsender mangler' using errcode = '23502';
  end if;
  v_role := case
    when exists (select 1 from public.leads l join public.cases c on c.id = l.case_id
                  where l.id = new.lead_id and c.patient_id = new.sender_id)
      then 'patient'::public.message_sender_role
    else 'clinic'::public.message_sender_role
  end;
  if new.sender_role is not null and new.sender_role <> v_role then
    raise exception 'SENDER_ROLE_MISMATCH' using errcode = '42501';
  end if;
  new.sender_role := v_role;
  return new;
end;
$$;

-- Afsenderen må kun blive til null (on delete set null); rollen er uforanderlig.
create or replace function public.messages_before_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.id is distinct from old.id or new.lead_id is distinct from old.lead_id
     or (new.sender_id is distinct from old.sender_id and new.sender_id is not null)
     or new.sender_role is distinct from old.sender_role
     or new.body is distinct from old.body
     or new.created_at is distinct from old.created_at then
    raise exception 'Feltet kan ikke ændres' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Patienten må markere klinikkens beskeder som læst, også når afsenderen er slettet (sender_id er null).
drop policy messages_update_mark_read on public.messages;
create policy messages_update_mark_read on public.messages
  for update to authenticated
  using (public.is_lead_patient(lead_id) and sender_role = 'clinic')
  with check (public.is_lead_patient(lead_id) and sender_role = 'clinic');

create or replace function public.clinic_lead_messages(p_lead_id uuid)
returns table (id uuid, body text, created_at timestamptz, read_at timestamptz, from_me boolean)
language sql stable security definer set search_path = ''
as $$
  select m.id, m.body, m.created_at, m.read_at, m.sender_role = 'clinic'
    from public.messages m
    join public.leads l on l.id = m.lead_id
   where m.lead_id = p_lead_id
     and l.status <> 'withdrawn'
     and public.is_my_clinic_lead(p_lead_id)
   order by m.created_at, m.id;
$$;

create or replace function public.clinic_mark_messages_read(p_lead_id uuid)
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
     and m.sender_role = 'patient' and m.read_at is null;
end;
$$;

create or replace function public.clinic_leads(p_status public.lead_status default null)
returns table (
  lead_id uuid,
  status public.lead_status,
  is_emergency boolean,
  service_names text[],
  postal_code text,
  city text,
  distance_km numeric,
  preferred_timeframe public.case_timeframe,
  requested_starts_at timestamptz,
  image_count integer,
  sent_at timestamptz,
  seen_at timestamptz,
  withdrawn_at timestamptz,
  unread_messages integer
)
language sql stable security definer set search_path = ''
as $$
  select
    l.id,
    l.status,
    case when l.status <> 'withdrawn' then c.is_emergency end,
    case when l.status <> 'withdrawn' then
      (select array_agg(s.name order by s.sort_order, s.name)
         from public.case_services cs join public.services s on s.id = cs.service_id
        where cs.case_id = c.id) end,
    case when l.status <> 'withdrawn' then c.postal_code end,
    case when l.status <> 'withdrawn' then pc.city end,
    case when l.status <> 'withdrawn' then l.distance_km end,
    case when l.status <> 'withdrawn' then c.preferred_timeframe end,
    case when l.status <> 'withdrawn' then l.requested_starts_at end,
    case when l.status <> 'withdrawn' then
      (select count(*)::integer from public.case_images i where i.case_id = c.id) end,
    l.sent_at,
    case when l.status <> 'withdrawn' then l.seen_at end,
    l.withdrawn_at,
    case when l.status <> 'withdrawn' then
      (select count(*)::integer from public.messages m
        where m.lead_id = l.id and m.sender_role = 'patient' and m.read_at is null) end
  from public.leads l
  join public.clinics k on k.id = l.clinic_id and k.owner_id = (select auth.uid()) and k.status = 'verified'
    and l.sent_at >= k.owner_since
  join public.cases c on c.id = l.case_id
  left join public.postal_codes pc on pc.postal_code = c.postal_code
  where p_status is null or l.status = p_status
  order by (l.status = 'sent') desc, c.is_emergency desc, l.sent_at desc;
$$;
