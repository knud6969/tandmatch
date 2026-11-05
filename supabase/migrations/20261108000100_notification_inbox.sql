-- Notifikationsklokken (platform 14.11, besluttet 2026-11-05).
-- (1) user_notifications: brugerens indbakke i klokken. Én række pr. hændelse og modtager, lagt af de samme triggere som
--     outboxen (i samme transaktion), uanset klinikkens e-mail- og push-valg og uanset nøgler og tilladelser.
--     Kun id'er og tidspunkter (samme payload-check som outboxen); teksterne renderes i lib/common/domain/notifications.ts.
-- (2) notification_inbox_add(): hjælperen, der lægger rækken (kun til triggerne; ingen EXECUTE for klientroller).
-- (3) Nye versioner af notification_enqueue(), enqueue_booking_reminders() og purge_notifications(), så de også fylder og
--     rydder indbakken. Triggerfunktionerne er uændrede (de kalder notification_enqueue()); fejl i indbakken fanges, så en
--     notifikation aldrig ruller selve handlingen tilbage.
-- (4) mark_notifications_read(): marker nogle eller alle egne som læst. Klientroller kan kun læse tabellen.

create table public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type public.notification_type not null,
  lead_id uuid references public.leads (id) on delete cascade,
  booking_id uuid references public.bookings (id) on delete cascade,
  payload jsonb not null default '{}',
  dedup_key text unique,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint user_notifications_payload_check
    check (jsonb_typeof(payload) = 'object'
       and payload - array['caseId', 'leadId', 'bookingId', 'startsAt', 'previousStartsAt', 'holdExpiresAt'] = '{}'::jsonb)
);

create index user_notifications_user_idx on public.user_notifications (user_id, created_at desc);
create index user_notifications_unread_idx on public.user_notifications (user_id, type, lead_id) where read_at is null;

alter table public.user_notifications enable row level security;
create policy user_notifications_select_own on public.user_notifications
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.user_notifications from anon, authenticated;
grant select on public.user_notifications to authenticated;

-- Lægger én række i modtagerens indbakke. Med dedup_key er hændelsen unik (on conflict do nothing). Uden (beskeder) lægges
-- der ikke en ny, så længe modtageren har en ulæst af samme type for samme lead. Kaldes kun af enqueue-hjælperen.
create function public.notification_inbox_add(
  p_user_id uuid, p_type public.notification_type, p_lead_id uuid, p_booking_id uuid, p_payload jsonb, p_dedup_key text
) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if p_user_id is null then
    return;
  end if;
  if p_dedup_key is null and exists (
    select 1 from public.user_notifications n
     where n.user_id = p_user_id and n.type = p_type and n.lead_id is not distinct from p_lead_id and n.read_at is null
  ) then
    return;
  end if;
  insert into public.user_notifications (user_id, type, lead_id, booking_id, payload, dedup_key)
  values (p_user_id, p_type, p_lead_id, p_booking_id, p_payload, p_dedup_key)
  on conflict (dedup_key) do nothing;
end;
$$;

-- Ny version af hjælperen fra 20261105000200: lægger først indbakkerækken (klinikkens nuværende ejer eller patienten), derefter
-- outbox-rækkerne som før. Indbakken påvirkes ikke af klinikkens indstillinger.
create or replace function public.notification_enqueue(
  p_type public.notification_type, p_clinic_id uuid, p_user_id uuid, p_lead_id uuid, p_booking_id uuid,
  p_payload jsonb, p_dedup_key text, p_throttle boolean default false
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_clinic boolean := p_type::text like 'clinic\_%';
  v_s public.clinic_notification_settings%rowtype;
  v_found boolean := false;
  v_email boolean := true;
  v_web boolean := false;
  v_channel public.notification_channel;
begin
  begin
    perform public.notification_inbox_add(
      case when v_clinic then (select c.owner_id from public.clinics c where c.id = p_clinic_id) else p_user_id end,
      p_type, p_lead_id, p_booking_id, p_payload, p_dedup_key);
  exception when others then
    raise warning 'notifikation kunne ikke lægges i indbakken (%)', sqlstate;
  end;

  if not v_clinic then
    if p_throttle and exists (
      select 1 from public.notification_outbox o
       where o.lead_id = p_lead_id and o.type = p_type and o.created_at > now() - interval '15 minutes' -- NOTIFY_MESSAGE_THROTTLE_MIN
    ) then
      return;
    end if;
    insert into public.notification_outbox (type, channel, recipient_user_id, lead_id, booking_id, payload, dedup_key)
    values (p_type, 'push', p_user_id, p_lead_id, p_booking_id, p_payload, p_dedup_key)
    on conflict (dedup_key) do nothing;
    return;
  end if;

  select * into v_s from public.clinic_notification_settings s where s.clinic_id = p_clinic_id;
  v_found := found;
  v_email := case p_type
               when 'clinic_new_lead' then not v_found or v_s.email_new_lead
               when 'clinic_new_message' then not v_found or v_s.email_new_message
               when 'clinic_booking_reminder' then not v_found or v_s.email_booking_reminder
               else not v_found or v_s.email_booking_changes
             end;
  v_web := case p_type
             when 'clinic_new_lead' then not v_found or v_s.web_push_new_lead
             when 'clinic_new_message' then not v_found or v_s.web_push_new_message
             when 'clinic_booking_reminder' then v_found and v_s.web_push_booking_reminder
             else not v_found or v_s.web_push_booking_changes
           end;
  if v_web then
    v_web := exists (select 1 from public.clinics c join public.web_push_subscriptions w on w.user_id = c.owner_id where c.id = p_clinic_id);
  end if;

  foreach v_channel in array array['email', 'web_push']::public.notification_channel[] loop
    continue when (v_channel = 'email' and not v_email) or (v_channel = 'web_push' and not v_web);
    if p_throttle and exists (
      select 1 from public.notification_outbox o
       where o.lead_id = p_lead_id and o.type = p_type and o.channel = v_channel
         and o.created_at > now() - interval '15 minutes' -- NOTIFY_MESSAGE_THROTTLE_MIN
    ) then
      continue;
    end if;
    insert into public.notification_outbox (type, channel, clinic_id, lead_id, booking_id, payload, dedup_key)
    values (p_type, v_channel, p_clinic_id, p_lead_id, p_booking_id, p_payload,
            case when p_dedup_key is null then null when v_channel = 'web_push' then 'web_push:' || p_dedup_key else p_dedup_key end)
    on conflict (dedup_key) do nothing;
  end loop;
end;
$$;

-- Ny version fra 20261105000200: påmindelsen lægges også i patientens og klinikejerens indbakke (uanset indstillinger).
-- Returnerer som før kun antallet af nye outbox-rækker. CTE'en inbox er ikke refereret, men kører alligevel.
create or replace function public.enqueue_booking_reminders()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_n integer;
begin
  with due as (
    select b.id, b.lead_id, b.clinic_id, b.patient_id, b.starts_at
      from public.bookings b
     where b.status = 'booked'
       and b.starts_at > now()
       and b.starts_at <= now() + interval '24 hours' -- BOOKING_REMINDER_HOURS
       and b.created_at <= b.starts_at - interval '24 hours'
  ),
  inbox as (
    insert into public.user_notifications (user_id, type, lead_id, booking_id, payload, dedup_key)
    select d.patient_id, 'patient_booking_reminder'::public.notification_type, d.lead_id, d.id,
           jsonb_build_object('bookingId', d.id, 'startsAt', public.notification_iso(d.starts_at)),
           'patient_booking_reminder:' || d.id
      from due d
    union all
    select c.owner_id, 'clinic_booking_reminder'::public.notification_type, d.lead_id, d.id,
           jsonb_build_object('leadId', d.lead_id, 'bookingId', d.id, 'startsAt', public.notification_iso(d.starts_at)),
           'clinic_booking_reminder:' || d.id
      from due d
      join public.clinics c on c.id = d.clinic_id
     where c.owner_id is not null
    on conflict (dedup_key) do nothing
    returning 1
  ),
  push as (
    insert into public.notification_outbox (type, channel, recipient_user_id, lead_id, booking_id, payload, dedup_key)
    select 'patient_booking_reminder', 'push', d.patient_id, d.lead_id, d.id,
           jsonb_build_object('bookingId', d.id, 'startsAt', public.notification_iso(d.starts_at)),
           'patient_booking_reminder:' || d.id
      from due d
    on conflict (dedup_key) do nothing
    returning 1
  ),
  mail as (
    insert into public.notification_outbox (type, channel, clinic_id, lead_id, booking_id, payload, dedup_key)
    select 'clinic_booking_reminder', 'email', d.clinic_id, d.lead_id, d.id,
           jsonb_build_object('leadId', d.lead_id, 'bookingId', d.id, 'startsAt', public.notification_iso(d.starts_at)),
           'clinic_booking_reminder:' || d.id
      from due d
      left join public.clinic_notification_settings s on s.clinic_id = d.clinic_id
     where coalesce(s.email_booking_reminder, true)
    on conflict (dedup_key) do nothing
    returning 1
  ),
  web as (
    insert into public.notification_outbox (type, channel, clinic_id, lead_id, booking_id, payload, dedup_key)
    select 'clinic_booking_reminder', 'web_push', d.clinic_id, d.lead_id, d.id,
           jsonb_build_object('leadId', d.lead_id, 'bookingId', d.id, 'startsAt', public.notification_iso(d.starts_at)),
           'web_push:clinic_booking_reminder:' || d.id
      from due d
      join public.clinic_notification_settings s on s.clinic_id = d.clinic_id and s.web_push_booking_reminder
     where exists (select 1 from public.clinics c join public.web_push_subscriptions w on w.user_id = c.owner_id where c.id = d.clinic_id)
    on conflict (dedup_key) do nothing
    returning 1
  )
  select (select count(*) from push) + (select count(*) from mail) + (select count(*) from web) into v_n;
  return v_n;
end;
$$;

-- Ny version fra 20261105000200: rydder også indbakken efter 30 dage (NOTIFY_RETENTION_DAYS). Returnerer antal outbox-rækker.
create or replace function public.purge_notifications()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_n integer;
begin
  with d as (
    delete from public.notification_outbox o
     where o.status in ('sent', 'failed', 'skipped') and o.created_at < now() - interval '30 days' -- NOTIFY_RETENTION_DAYS
    returning 1
  ) select count(*) into v_n from d;
  delete from public.user_notifications n where n.created_at < now() - interval '30 days'; -- NOTIFY_RETENTION_DAYS
  return v_n;
end;
$$;

-- Marker egne notifikationer som læst: de angivne (højst 100) eller alle, hvis p_ids er null. Rører aldrig andres rækker.
-- Returnerer antal rækker, der blev markeret.
create function public.mark_notifications_read(p_ids uuid[] default null)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_n integer;
begin
  if v_uid is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;
  if p_ids is not null and cardinality(p_ids) > 100 then
    raise exception 'INVALID_INPUT' using errcode = '22023';
  end if;
  with u as (
    update public.user_notifications n set read_at = now()
     where n.user_id = v_uid and n.read_at is null and (p_ids is null or n.id = any (p_ids))
    returning 1
  ) select count(*) into v_n from u;
  return v_n;
end;
$$;

revoke all on function public.notification_inbox_add(uuid, public.notification_type, uuid, uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.mark_notifications_read(uuid[]) from public, anon;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;
