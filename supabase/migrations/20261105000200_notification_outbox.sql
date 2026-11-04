-- Notifikationer (platform 14, clinics 4.3 `clinic_notification_settings`, besluttet 2026-11-04).
-- (1) clinic_notification_settings: klinikkens e-mailvalg. Ingen række = alle typer slået til.
-- (2) notification_outbox: rækker lægges af triggerne på leads, messages og bookings i samme transaktion som handlingen.
--     Tabellen har RLS uden policies; kun triggerne og service role-funktionerne rører den (platform 5.4).
-- (3) Triggerne notify_after_lead_change(), notify_after_message() og notify_after_booking_change(). Enqueue-delen fanger
--     alle fejl (raise warning uden indhold), så en notifikation aldrig ruller handlingen tilbage.
-- (3b) web_push_subscriptions: klinikejerens browser-abonnementer (web push, platform 14.2) og register_web_push_subscription().
-- (4) claim_notifications(), complete_notification(), purge_notifications() og enqueue_booking_reminders(): kun service role.
-- Konstanterne (15 min, 5 forsøg, 2 min lås, 30 dage, 24 timer) står også i lib/common/constants/notifications.ts.

-- ---------------------------------------------------------------------------------------------------------
-- Klinikkens indstillinger
-- ---------------------------------------------------------------------------------------------------------
create table public.clinic_notification_settings (
  clinic_id uuid primary key references public.clinics (id),
  email_new_lead boolean not null default true,
  email_new_message boolean not null default true,
  email_booking_changes boolean not null default true,
  email_booking_reminder boolean not null default true,
  web_push_new_lead boolean not null default true,
  web_push_new_message boolean not null default true,
  web_push_booking_changes boolean not null default true,
  web_push_booking_reminder boolean not null default false,
  updated_at timestamptz not null default now()
);

create trigger clinic_notification_settings_touch
  before update on public.clinic_notification_settings
  for each row execute function public.touch_updated_at();

alter table public.clinic_notification_settings enable row level security;

create policy clinic_notification_settings_select_owner on public.clinic_notification_settings
  for select to authenticated using (public.is_clinic_owner(clinic_id));
create policy clinic_notification_settings_insert_owner on public.clinic_notification_settings
  for insert to authenticated with check (public.is_clinic_owner(clinic_id) and public.is_permanent_user());
create policy clinic_notification_settings_update_owner on public.clinic_notification_settings
  for update to authenticated
  using (public.is_clinic_owner(clinic_id))
  with check (public.is_clinic_owner(clinic_id) and public.is_permanent_user());

revoke all on public.clinic_notification_settings from anon, authenticated;
grant select on public.clinic_notification_settings to authenticated;
grant insert (clinic_id, email_new_lead, email_new_message, email_booking_changes, email_booking_reminder,
              web_push_new_lead, web_push_new_message, web_push_booking_changes, web_push_booking_reminder)
  on public.clinic_notification_settings to authenticated;
grant update (email_new_lead, email_new_message, email_booking_changes, email_booking_reminder,
              web_push_new_lead, web_push_new_message, web_push_booking_changes, web_push_booking_reminder)
  on public.clinic_notification_settings to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- Klinikejerens web push-abonnementer (én pr. browser)
-- ---------------------------------------------------------------------------------------------------------
create table public.web_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  constraint web_push_endpoint_check check (endpoint ~ '^https://[^[:space:]]+$' and char_length(endpoint) between 12 and 500),
  constraint web_push_p256dh_check check (p256dh ~ '^[A-Za-z0-9_-]{87}$'),
  constraint web_push_auth_check check (auth ~ '^[A-Za-z0-9_-]{22}$')
);
create index web_push_subscriptions_user_idx on public.web_push_subscriptions (user_id, last_used_at desc);

alter table public.web_push_subscriptions enable row level security;
create policy web_push_subscriptions_select_own on public.web_push_subscriptions
  for select to authenticated using (user_id = (select auth.uid()));
create policy web_push_subscriptions_delete_own on public.web_push_subscriptions
  for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.web_push_subscriptions from anon, authenticated;
grant select, delete on public.web_push_subscriptions to authenticated;

-- Registrerer browserens abonnement for den kaldende klinikejer. Samme browser med ny konto flytter abonnementet.
-- Pladsholderen 10 svarer til MAX_WEB_PUSH_SUBSCRIPTIONS_PER_USER i lib/clinics/constants/web-push.ts.
create function public.register_web_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_max constant integer := 10;
begin
  if v_uid is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;
  if not public.is_permanent_user()
     or not exists (select 1 from public.profiles p where p.id = v_uid and p.role = 'clinic') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_endpoint is null or p_endpoint !~ '^https://[^[:space:]]+$' or char_length(p_endpoint) not between 12 and 500
     or p_p256dh is null or p_p256dh !~ '^[A-Za-z0-9_-]{87}$'
     or p_auth is null or p_auth !~ '^[A-Za-z0-9_-]{22}$' then
    raise exception 'INVALID_INPUT' using errcode = '22023';
  end if;

  delete from public.web_push_subscriptions where endpoint = p_endpoint and user_id <> v_uid;

  insert into public.web_push_subscriptions (user_id, endpoint, p256dh, auth, created_at, last_used_at)
  values (v_uid, p_endpoint, p_p256dh, p_auth, clock_timestamp(), clock_timestamp())
  on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth, last_used_at = clock_timestamp();

  delete from public.web_push_subscriptions t
   where t.user_id = v_uid
     and t.id in (
       select o.id from public.web_push_subscriptions o
        where o.user_id = v_uid
        order by o.last_used_at desc, o.created_at desc, o.id
        offset v_max
     );
end;
$$;
revoke all on function public.register_web_push_subscription(text, text, text) from public, anon;
grant execute on function public.register_web_push_subscription(text, text, text) to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- Outbox
-- ---------------------------------------------------------------------------------------------------------
create type public.notification_type as enum (
  'clinic_new_lead', 'clinic_new_message', 'clinic_booking_created', 'clinic_booking_cancelled',
  'clinic_booking_rescheduled', 'clinic_booking_reminder',
  'patient_lead_answered', 'patient_new_message', 'patient_booking_confirmed', 'patient_booking_cancelled',
  'patient_booking_reminder'
);
create type public.notification_channel as enum ('email', 'push', 'web_push');
create type public.notification_status as enum ('pending', 'sending', 'sent', 'failed', 'skipped');

create table public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  type public.notification_type not null,
  channel public.notification_channel not null,
  clinic_id uuid references public.clinics (id),
  recipient_user_id uuid references public.profiles (id) on delete cascade,
  lead_id uuid references public.leads (id) on delete cascade,
  booking_id uuid references public.bookings (id) on delete cascade,
  payload jsonb not null default '{}',
  dedup_key text unique,
  status public.notification_status not null default 'pending',
  attempts smallint not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_until timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  -- Kanalen følger typen: klinikkens typer går som e-mail eller web push, patientens som app-push.
  constraint notification_outbox_channel_check
    check ((channel = 'push') = (type::text like 'patient\_%')),
  -- Præcis én modtager efter kanalen: e-mail og web push til en klinik, app-push til en patient.
  constraint notification_outbox_recipient_check
    check ((channel in ('email', 'web_push') and clinic_id is not null and recipient_user_id is null)
        or (channel = 'push' and recipient_user_id is not null and clinic_id is null)),
  -- Kun id'er og tidspunkter: aldrig helbredsdata, navne, beskedtekst eller adresser (platform 14.2).
  constraint notification_outbox_payload_check
    check (jsonb_typeof(payload) = 'object'
       and payload - array['caseId', 'leadId', 'bookingId', 'startsAt', 'previousStartsAt', 'holdExpiresAt'] = '{}'::jsonb),
  constraint notification_outbox_last_error_check check (char_length(last_error) <= 100),
  constraint notification_outbox_attempts_check check (attempts between 0 and 10)
);

create index notification_outbox_due_idx on public.notification_outbox (status, next_attempt_at);
create index notification_outbox_throttle_idx on public.notification_outbox (lead_id, type, created_at);

alter table public.notification_outbox enable row level security;
revoke all on public.notification_outbox from anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- Hjælpere (kun til triggerne; ingen EXECUTE for klientroller)
-- ---------------------------------------------------------------------------------------------------------
create function public.notification_iso(p_at timestamptz)
returns text
language sql immutable set search_path = ''
as $$ select to_char(p_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') $$;

-- Lægger rækker i outboxen: klinikkens typer som e-mail og/eller web push (efter klinikkens valg; web push kun hvis
-- ejeren har et abonnement), patientens som app-push. Beskeder dæmpes. Kanalen udledes af typen. Kaldes kun af
-- triggerne, som selv fanger fejl. Web push-rækkens dedup_key har præfikset `web_push:`.
create function public.notification_enqueue(
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

-- ---------------------------------------------------------------------------------------------------------
-- Triggere (platform 14.4)
-- ---------------------------------------------------------------------------------------------------------
create function public.notify_after_lead_change()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_patient uuid;
  v_payload jsonb;
begin
  begin
    if tg_op = 'INSERT' then
      v_payload := jsonb_build_object('leadId', new.id);
      if new.requested_starts_at is not null then
        -- Samme regel som hold_expires_at i send_leads(); bookingen er ikke indsat endnu, når triggeren kører.
        v_payload := v_payload || jsonb_build_object('holdExpiresAt',
          public.notification_iso(least(new.sent_at + interval '30 minutes', new.requested_starts_at)));
      end if;
      perform public.notification_enqueue('clinic_new_lead', new.clinic_id, null, new.id, null, v_payload,
                                          'clinic_new_lead:' || new.id);
    else
      -- Klinikkens svar (responded_at går fra null til en værdi), også systemets clinic_left.
      select c.patient_id into v_patient from public.cases c where c.id = new.case_id;
      if v_patient is not null then
        perform public.notification_enqueue(
          case when new.status = 'booked' then 'patient_booking_confirmed' else 'patient_lead_answered' end::public.notification_type,
          null, v_patient, new.id, null,
          jsonb_build_object('caseId', new.case_id, 'leadId', new.id),
          case when new.status = 'booked' then 'patient_booking_confirmed:' else 'patient_lead_answered:' end || new.id);
      end if;
    end if;
  exception when others then
    raise warning 'notifikation kunne ikke lægges i outboxen (%)', sqlstate;
  end;
  return null;
end;
$$;

create trigger leads_notify_insert
  after insert on public.leads
  for each row execute function public.notify_after_lead_change();
create trigger leads_notify_response
  after update of responded_at on public.leads
  for each row when (old.responded_at is null and new.responded_at is not null)
  execute function public.notify_after_lead_change();

create function public.notify_after_message()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_clinic uuid;
  v_case uuid;
  v_patient uuid;
begin
  begin
    select l.clinic_id, l.case_id into v_clinic, v_case from public.leads l where l.id = new.lead_id;
    if new.sender_role = 'patient' then
      perform public.notification_enqueue('clinic_new_message', v_clinic, null, new.lead_id, null,
                                          jsonb_build_object('leadId', new.lead_id), null, true);
    else
      select c.patient_id into v_patient from public.cases c where c.id = v_case;
      if v_patient is not null then
        perform public.notification_enqueue('patient_new_message', null, v_patient, new.lead_id, null,
                                            jsonb_build_object('caseId', v_case, 'leadId', new.lead_id), null, true);
      end if;
    end if;
  exception when others then
    raise warning 'notifikation kunne ikke lægges i outboxen (%)', sqlstate;
  end;
  return null;
end;
$$;

create trigger messages_notify_insert
  after insert on public.messages
  for each row execute function public.notify_after_message();

create function public.notify_after_booking_change()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  begin
    if tg_op = 'INSERT' then
      -- En held-booking (akut) giver ingen række her; klinikken har allerede clinic_new_lead.
      if new.status = 'booked' then
        perform public.notification_enqueue('clinic_booking_created', new.clinic_id, null, new.lead_id, new.id,
          jsonb_build_object('leadId', new.lead_id, 'bookingId', new.id, 'startsAt', public.notification_iso(new.starts_at)),
          'clinic_booking_created:' || new.id);
      end if;
    elsif old.status = 'booked' and new.status = 'cancelled' then
      -- held -> booked giver ingen række her (den kommer fra lead-triggeren); held -> cancelled heller ikke.
      if new.cancelled_by = 'patient' then
        -- reschedule_booking() sætter tm.rescheduling (PR B); så kommer meddelelsen fra den nye booking.
        if coalesce(current_setting('tm.rescheduling', true), '') <> 'on' then
          perform public.notification_enqueue('clinic_booking_cancelled', new.clinic_id, null, new.lead_id, new.id,
            jsonb_build_object('leadId', new.lead_id, 'bookingId', new.id, 'startsAt', public.notification_iso(new.starts_at)),
            'clinic_booking_cancelled:' || new.id);
        end if;
      elsif new.cancelled_by = 'clinic' then
        perform public.notification_enqueue('patient_booking_cancelled', null, new.patient_id, new.lead_id, new.id,
          jsonb_build_object('bookingId', new.id),
          'patient_booking_cancelled:' || new.id);
      end if;
    end if;
  exception when others then
    raise warning 'notifikation kunne ikke lægges i outboxen (%)', sqlstate;
  end;
  return null;
end;
$$;

create trigger bookings_notify_insert
  after insert on public.bookings
  for each row execute function public.notify_after_booking_change();
create trigger bookings_notify_status
  after update of status on public.bookings
  for each row when (old.status is distinct from new.status)
  execute function public.notify_after_booking_change();

-- ---------------------------------------------------------------------------------------------------------
-- Afsendelse (platform 14.5): kun service role
-- ---------------------------------------------------------------------------------------------------------
create function public.claim_notifications(p_limit integer default 20)
returns table (
  id uuid, type public.notification_type, channel public.notification_channel, payload jsonb, attempts smallint,
  clinic_id uuid, recipient_user_id uuid, to_email text, push_tokens text[], web_push_subscriptions jsonb
)
language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  -- En række, hvis lås er udløbet efter det sidste forsøg, opgives (processen døde midt i afsendelsen).
  update public.notification_outbox o
     set status = 'failed', locked_until = null, last_error = 'LOCK_EXPIRED'
   where o.status = 'sending' and o.locked_until <= now() and o.attempts >= 5; -- NOTIFY_MAX_ATTEMPTS

  return query
  with picked as (
    select o.id from public.notification_outbox o
     where (o.status = 'pending' and o.next_attempt_at <= now())
        or (o.status = 'sending' and o.locked_until <= now())
     order by o.next_attempt_at, o.created_at
     limit greatest(1, least(coalesce(p_limit, 20), 100))
     for update skip locked
  ),
  upd as (
    update public.notification_outbox o
       set status = 'sending', locked_until = now() + interval '2 minutes', attempts = o.attempts + 1 -- NOTIFY_LOCK_MINUTES
      from picked
     where o.id = picked.id
    returning o.*
  )
  select u.id, u.type, u.channel, u.payload, u.attempts, u.clinic_id, u.recipient_user_id,
         -- E-mail: den nuværende ejers login-e-mail, kun for en verificeret klinik og et lead sendt efter ejerskabet.
         case when u.channel = 'email' then (
           select au.email::text
             from public.clinics c
             join auth.users au on au.id = c.owner_id
            where c.id = u.clinic_id and c.status = 'verified'
              and (u.lead_id is null or exists (select 1 from public.leads l where l.id = u.lead_id and l.sent_at >= c.owner_since))
         ) end,
         case when u.channel = 'push' then coalesce((
           select array_agg(t.token order by t.last_seen_at desc)
             from public.push_tokens t where t.user_id = u.recipient_user_id
         ), '{}'::text[]) end,
         -- Web push: samme regler som e-mail, men målet er den nuværende ejers browserabonnementer.
         case when u.channel = 'web_push' then coalesce((
           select jsonb_agg(jsonb_build_object('endpoint', w.endpoint, 'p256dh', w.p256dh, 'auth', w.auth) order by w.last_used_at desc)
             from public.clinics c
             join public.web_push_subscriptions w on w.user_id = c.owner_id
            where c.id = u.clinic_id and c.status = 'verified'
              and (u.lead_id is null or exists (select 1 from public.leads l where l.id = u.lead_id and l.sent_at >= c.owner_since))
         ), '[]'::jsonb) end
    from upd u
   order by u.created_at;
end;
$$;

-- p_invalid_tokens: app-push-tokens (Expo DeviceNotRegistered) eller web push-endpoints (404/410), der slettes. Kun
-- modtagerens egne rækker røres: patientens tokens, eller klinikkens nuværende ejers abonnementer.
create function public.complete_notification(
  p_id uuid, p_status text, p_error_code text default null, p_invalid_tokens text[] default null
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_row public.notification_outbox%rowtype;
  -- Kun en fejlkode (store bogstaver, tal og understreg), aldrig svarets indhold, adresse eller token.
  v_code text := case when p_error_code ~ '^[A-Z0-9_]{1,100}$' then p_error_code end;
begin
  if p_status not in ('sent', 'skipped', 'retry', 'failed') then
    raise exception 'INVALID_INPUT' using errcode = '22023';
  end if;
  select * into v_row from public.notification_outbox o where o.id = p_id and o.status = 'sending' for update;
  if not found then
    return;
  end if;

  if p_invalid_tokens is not null then
    if v_row.channel = 'push' then
      delete from public.push_tokens t where t.user_id = v_row.recipient_user_id and t.token = any (p_invalid_tokens);
    elsif v_row.channel = 'web_push' then
      delete from public.web_push_subscriptions w
       where w.endpoint = any (p_invalid_tokens)
         and w.user_id = (select c.owner_id from public.clinics c where c.id = v_row.clinic_id);
    end if;
  end if;

  if p_status = 'sent' then
    update public.notification_outbox set status = 'sent', sent_at = now(), locked_until = null, last_error = null where id = p_id;
  elsif p_status = 'skipped' then
    update public.notification_outbox set status = 'skipped', locked_until = null, last_error = v_code where id = p_id;
  elsif p_status = 'failed' or v_row.attempts >= 5 then -- NOTIFY_MAX_ATTEMPTS
    update public.notification_outbox set status = 'failed', locked_until = null, last_error = v_code where id = p_id;
  else
    -- Udskydelse efter fejl: 1, 5, 15 og 60 minutter.
    update public.notification_outbox
       set status = 'pending', locked_until = null, last_error = v_code,
           next_attempt_at = now() + make_interval(mins => (array[1, 5, 15, 60])[least(greatest(v_row.attempts, 1), 4)])
     where id = p_id;
  end if;
end;
$$;

create function public.purge_notifications()
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
  return v_n;
end;
$$;

-- Påmindelse dagen før en booket tid (platform 14.8). Idempotent via dedup_key.
create function public.enqueue_booking_reminders()
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

-- ---------------------------------------------------------------------------------------------------------
-- Rettigheder
-- ---------------------------------------------------------------------------------------------------------
revoke all on function public.notification_iso(timestamptz) from public, anon, authenticated;
revoke all on function public.notification_enqueue(public.notification_type, uuid, uuid, uuid, uuid, jsonb, text, boolean) from public, anon, authenticated;
revoke all on function public.notify_after_lead_change() from public, anon, authenticated;
revoke all on function public.notify_after_message() from public, anon, authenticated;
revoke all on function public.notify_after_booking_change() from public, anon, authenticated;
revoke all on function public.claim_notifications(integer) from public, anon, authenticated;
revoke all on function public.complete_notification(uuid, text, text, text[]) from public, anon, authenticated;
revoke all on function public.purge_notifications() from public, anon, authenticated;
revoke all on function public.enqueue_booking_reminders() from public, anon, authenticated;
grant execute on function public.claim_notifications(integer) to service_role;
grant execute on function public.complete_notification(uuid, text, text, text[]) to service_role;
grant execute on function public.purge_notifications() to service_role;
grant execute on function public.enqueue_booking_reminders() to service_role;
