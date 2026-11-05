-- Patientens e-mail og SMS om bookinger (platform 14.12, identity 4.3 `patient_notification_contacts`). Del 2.
-- (1) patient_notification_contacts: patientens egen e-mail og eget nummer til notifikationer. Kun patienten ser og retter
--     rækken; ingen funktion giver klinikken adgang. patients.phone genbruges ikke: den overskrives af bookingens kontaktfelt
--     og er kun et forslag, så en SMS kunne ellers gå til et nummer, patienten ikke har valgt til notifikationer.
-- (2) notification_outbox: patientens typer må nu også gå som e-mail og SMS (recipient_user_id). Ingen adresse eller nummer
--     lægges i outboxen; claim_notifications() slår dem op ved afsendelsen.
-- (3) Nye versioner af notification_enqueue(), notify_after_booking_change(), enqueue_booking_reminders() og
--     claim_notifications() (nu med to_phone).

-- ---------------------------------------------------------------------------------------------------------
-- Patientens kontaktoplysninger til notifikationer
-- ---------------------------------------------------------------------------------------------------------
create table public.patient_notification_contacts (
  patient_id uuid primary key references public.patients (id) on delete cascade,
  email text,
  phone text,
  updated_at timestamptz not null default now(),
  constraint patient_notification_contacts_email_check
    check (email is null or (char_length(email) <= 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  constraint patient_notification_contacts_phone_check check (phone is null or public.is_valid_phone(phone))
);

create trigger patient_notification_contacts_touch
  before update on public.patient_notification_contacts
  for each row execute function public.touch_updated_at();

alter table public.patient_notification_contacts enable row level security;
create policy patient_notification_contacts_select_own on public.patient_notification_contacts
  for select to authenticated using (patient_id = (select auth.uid()));
create policy patient_notification_contacts_insert_own on public.patient_notification_contacts
  for insert to authenticated with check (patient_id = (select auth.uid()) and public.is_permanent_user());
create policy patient_notification_contacts_update_own on public.patient_notification_contacts
  for update to authenticated
  using (patient_id = (select auth.uid()))
  with check (patient_id = (select auth.uid()) and public.is_permanent_user());
create policy patient_notification_contacts_delete_own on public.patient_notification_contacts
  for delete to authenticated using (patient_id = (select auth.uid()));

revoke all on public.patient_notification_contacts from anon, authenticated;
grant select, delete on public.patient_notification_contacts to authenticated;
grant insert (patient_id, email, phone) on public.patient_notification_contacts to authenticated;
-- patient_id står med, fordi PostgREST-upsert sætter alle kolonner i kaldet; policyens with check holder det til egen række.
grant update (patient_id, email, phone) on public.patient_notification_contacts to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- Outbox: patientens typer må gå som push, e-mail og SMS; klinikkens som e-mail og web push
-- ---------------------------------------------------------------------------------------------------------
alter table public.notification_outbox drop constraint notification_outbox_channel_check;
alter table public.notification_outbox drop constraint notification_outbox_recipient_check;
alter table public.notification_outbox
  add constraint notification_outbox_channel_check
    check ((type::text like 'clinic\_%' and channel::text in ('email', 'web_push'))
        or (type::text like 'patient\_%' and channel::text in ('push', 'email', 'sms'))),
  add constraint notification_outbox_recipient_check
    check ((type::text like 'clinic\_%' and clinic_id is not null and recipient_user_id is null)
        or (type::text like 'patient\_%' and recipient_user_id is not null and clinic_id is null));

-- ---------------------------------------------------------------------------------------------------------
-- Enqueue: patientens booking-typer får også e-mail og SMS
-- ---------------------------------------------------------------------------------------------------------
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
    -- App-push: ikke for patientens egne handlinger (booket, flyttet, aflyst af patienten selv).
    if p_type::text not in ('patient_booking_created', 'patient_booking_rescheduled', 'patient_booking_cancelled_self', 'patient_review_reminder')
       and not (p_throttle and exists (
         select 1 from public.notification_outbox o
          where o.lead_id = p_lead_id and o.type = p_type and o.created_at > now() - interval '15 minutes' -- NOTIFY_MESSAGE_THROTTLE_MIN
       )) then
      insert into public.notification_outbox (type, channel, recipient_user_id, lead_id, booking_id, payload, dedup_key)
      values (p_type, 'push', p_user_id, p_lead_id, p_booking_id, p_payload, p_dedup_key)
      on conflict (dedup_key) do nothing;
    end if;
    -- E-mail og SMS: kun bookinger. Adresse og nummer slås op ved afsendelsen; mangler de, springes rækken over.
    if p_type::text in ('patient_booking_created', 'patient_booking_rescheduled', 'patient_booking_cancelled_self',
                        'patient_booking_confirmed', 'patient_booking_cancelled', 'patient_booking_reminder', 'patient_review_reminder') then
      foreach v_channel in array array['email', 'sms']::public.notification_channel[] loop
        insert into public.notification_outbox (type, channel, recipient_user_id, lead_id, booking_id, payload, dedup_key)
        values (p_type, v_channel, p_user_id, p_lead_id, p_booking_id, p_payload, v_channel::text || ':' || p_dedup_key)
        on conflict (dedup_key) do nothing;
      end loop;
    end if;
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
-- Booking-triggeren: også patientens egne handlinger (booket, flyttet, aflyst)
-- ---------------------------------------------------------------------------------------------------------
create or replace function public.notify_after_booking_change()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_previous timestamptz;
begin
  begin
    if tg_op = 'INSERT' then
      -- En held-booking (akut) giver ingen række her; klinikken har allerede clinic_new_lead.
      if new.status = 'booked' and new.rescheduled_from_id is null then
        perform public.notification_enqueue('clinic_booking_created', new.clinic_id, null, new.lead_id, new.id,
          jsonb_build_object('leadId', new.lead_id, 'bookingId', new.id, 'startsAt', public.notification_iso(new.starts_at)),
          'clinic_booking_created:' || new.id);
        perform public.notification_enqueue('patient_booking_created', null, new.patient_id, new.lead_id, new.id,
          jsonb_build_object('bookingId', new.id, 'startsAt', public.notification_iso(new.starts_at)),
          'patient_booking_created:' || new.id);
      elsif new.status = 'booked' then
        select o.starts_at into v_previous from public.bookings o where o.id = new.rescheduled_from_id;
        perform public.notification_enqueue('clinic_booking_rescheduled', new.clinic_id, null, new.lead_id, new.id,
          jsonb_build_object('leadId', new.lead_id, 'bookingId', new.id, 'startsAt', public.notification_iso(new.starts_at),
                             'previousStartsAt', public.notification_iso(v_previous)),
          'clinic_booking_rescheduled:' || new.id);
        perform public.notification_enqueue('patient_booking_rescheduled', null, new.patient_id, new.lead_id, new.id,
          jsonb_build_object('bookingId', new.id, 'startsAt', public.notification_iso(new.starts_at),
                             'previousStartsAt', public.notification_iso(v_previous)),
          'patient_booking_rescheduled:' || new.id);
      end if;
    elsif old.status = 'booked' and new.status = 'cancelled' then
      -- held -> booked giver ingen række her (den kommer fra lead-triggeren); held -> cancelled heller ikke.
      if new.cancelled_by = 'patient' then
        -- reschedule_booking() sætter tm.rescheduling; så kommer meddelelsen fra den nye booking.
        if coalesce(current_setting('tm.rescheduling', true), '') <> 'on' then
          perform public.notification_enqueue('clinic_booking_cancelled', new.clinic_id, null, new.lead_id, new.id,
            jsonb_build_object('leadId', new.lead_id, 'bookingId', new.id, 'startsAt', public.notification_iso(new.starts_at)),
            'clinic_booking_cancelled:' || new.id);
          perform public.notification_enqueue('patient_booking_cancelled_self', null, new.patient_id, new.lead_id, new.id,
            jsonb_build_object('bookingId', new.id, 'startsAt', public.notification_iso(new.starts_at)),
            'patient_booking_cancelled_self:' || new.id);
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

-- ---------------------------------------------------------------------------------------------------------
-- Påmindelser: patienten får også e-mail og SMS (indbakken som i 20261108000100)
-- ---------------------------------------------------------------------------------------------------------
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
  patient_contact as (
    insert into public.notification_outbox (type, channel, recipient_user_id, lead_id, booking_id, payload, dedup_key)
    select 'patient_booking_reminder', ch.channel, d.patient_id, d.lead_id, d.id,
           jsonb_build_object('bookingId', d.id, 'startsAt', public.notification_iso(d.starts_at)),
           ch.channel::text || ':patient_booking_reminder:' || d.id
      from due d
     cross join (values ('email'::public.notification_channel), ('sms'::public.notification_channel)) as ch (channel)
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
  select (select count(*) from push) + (select count(*) from patient_contact) + (select count(*) from mail) + (select count(*) from web)
    into v_n;
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Påmindelse om at skrive en anmeldelse dagen efter tiden (platform 14.8). Kun gennemførte besøg (effektiv status
-- completed: sluttidspunktet + 24 timer er passeret, ikke udeblivelse eller aflysning), hos en verificeret klinik, uden
-- anmeldelse. Vinduet på 72 timer forhindrer, at gamle bookinger får en påmindelse, første gang jobbet kører. Idempotent via
-- dedup_key (patient_review_reminder:<booking_id>); lægges via notification_enqueue(): klokken, e-mail og SMS, ingen app-push.
-- Returnerer antal nye påmindelser. Kun service role.
-- ---------------------------------------------------------------------------------------------------------
create function public.enqueue_review_reminders()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  r record;
  v_n integer := 0;
begin
  for r in
    select b.id, b.lead_id, b.patient_id, b.starts_at
      from public.bookings b
      join public.clinics k on k.id = b.clinic_id and k.status = 'verified'
     where public.effective_booking_status(b.status, b.ends_at, b.hold_expires_at) = 'completed'
       and b.ends_at + interval '24 hours' <= now()
       and b.ends_at + interval '96 hours' > now() -- REVIEW_REMINDER_WINDOW_HOURS (24 + 72)
       and not exists (select 1 from public.reviews rv where rv.booking_id = b.id)
       and not exists (select 1 from public.user_notifications n where n.dedup_key = 'patient_review_reminder:' || b.id)
  loop
    begin
      perform public.notification_enqueue('patient_review_reminder', null, r.patient_id, r.lead_id, r.id,
        jsonb_build_object('bookingId', r.id, 'startsAt', public.notification_iso(r.starts_at)),
        'patient_review_reminder:' || r.id);
      v_n := v_n + 1;
    exception when others then
      raise warning 'anmeldelsespåmindelse kunne ikke lægges (%)', sqlstate;
    end;
  end loop;
  return v_n;
end;
$$;

revoke all on function public.enqueue_review_reminders() from public, anon, authenticated;
grant execute on function public.enqueue_review_reminders() to service_role;

-- ---------------------------------------------------------------------------------------------------------
-- claim_notifications: nu også patientens e-mail og telefonnummer (kun service role, slået op ved afsendelsen)
-- ---------------------------------------------------------------------------------------------------------
drop function public.claim_notifications(integer);

create function public.claim_notifications(p_limit integer default 20)
returns table (
  id uuid, type public.notification_type, channel public.notification_channel, payload jsonb, attempts smallint,
  clinic_id uuid, recipient_user_id uuid, to_email text, push_tokens text[], web_push_subscriptions jsonb, to_phone text
)
language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_column
begin
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
         case when u.channel = 'email' and u.clinic_id is not null then (
           -- Klinik: den nuværende ejers login-e-mail, kun for en verificeret klinik og et lead sendt efter ejerskabet.
           select au.email::text
             from public.clinics c
             join auth.users au on au.id = c.owner_id
            where c.id = u.clinic_id and c.status = 'verified'
              and (u.lead_id is null or exists (select 1 from public.leads l where l.id = u.lead_id and l.sent_at >= c.owner_since))
         ) when u.channel = 'email' then (
           -- Patient (kun med konto): den valgte notifikations-e-mail, ellers login-e-mailen.
           select coalesce(pc.email, au.email)::text
             from auth.users au
             join public.profiles pr on pr.id = au.id and pr.role = 'patient' and not pr.is_anonymous
             left join public.patient_notification_contacts pc on pc.patient_id = au.id
            where au.id = u.recipient_user_id
         ) end,
         case when u.channel = 'push' then coalesce((
           select array_agg(t.token order by t.last_seen_at desc)
             from public.push_tokens t where t.user_id = u.recipient_user_id
         ), '{}'::text[]) end,
         case when u.channel = 'web_push' then coalesce((
           select jsonb_agg(jsonb_build_object('endpoint', w.endpoint, 'p256dh', w.p256dh, 'auth', w.auth) order by w.last_used_at desc)
             from public.clinics c
             join public.web_push_subscriptions w on w.user_id = c.owner_id
            where c.id = u.clinic_id and c.status = 'verified'
              and (u.lead_id is null or exists (select 1 from public.leads l where l.id = u.lead_id and l.sent_at >= c.owner_since))
         ), '[]'::jsonb) end,
         case when u.channel = 'sms' then (
           select pc.phone from public.patient_notification_contacts pc where pc.patient_id = u.recipient_user_id
         ) end
    from upd u
   order by u.created_at;
end;
$$;

revoke all on function public.claim_notifications(integer) from public, anon, authenticated;
grant execute on function public.claim_notifications(integer) to service_role;
