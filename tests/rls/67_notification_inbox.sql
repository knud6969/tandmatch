-- Test 67 (RLS-punkt 62; platform 14.11-14.12; migrationerne 20261108000100, 20261108000200 og 20261108000300):
--  * user_notifications: hver bruger ser kun egne rækker; ingen direkte INSERT/UPDATE/DELETE; mark_notifications_read() rører kun egne.
--  * Klokken fyldes af de samme triggere som outboxen, også når klinikken har slået e-mail og web push fra; en besked giver kun
--    én ulæst række; en fejl i indbakken ruller ikke handlingen tilbage.
--  * patient_notification_contacts: kun patienten ser og retter egen række; klinik, admin og anonym har ingen adgang; ugyldige værdier afvises.
--  * Patientens e-mail og SMS: kun booket, flyttet, bekræftet, aflyst, påmindelse og anmeldelsespåmindelse; aldrig svar og beskeder; ingen
--    adresse eller nummer i payload; claim_notifications() slår adresse og nummer op.
--  * enqueue_review_reminders(): kun gennemførte besøg uden anmeldelse, kun én gang.
begin;
\ir _helpers.sql
\ir _fixtures.sql

-- Tæller rækker uanset rolle.
create function tt.inbox(p_user text, p_type text default null, p_unread boolean default false) returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.user_notifications n
   where n.user_id = tt.id(p_user) and (p_type is null or n.type::text = p_type) and (not p_unread or n.read_at is null)
$$;
grant execute on function tt.inbox(text, text, boolean) to public;
create function tt.ob(p_user_or_clinic text, p_type text, p_channel text) returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.notification_outbox o
   where o.type::text = p_type and o.channel::text = p_channel
     and (o.recipient_user_id = tt.id(p_user_or_clinic) or o.clinic_id = tt.cid(p_user_or_clinic))
$$;
grant execute on function tt.ob(text, text, text) to public;
create function tt.active_booking(p_lead uuid) returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.bookings where lead_id = p_lead and status = 'booked'
$$;
grant execute on function tt.active_booking(uuid) to public;

delete from public.notification_outbox;
delete from public.user_notifications;

-- ---------------------------------------------------------------------------------------------------------
-- Henvendelser: klokken for klinikkerne, hver sin
-- ---------------------------------------------------------------------------------------------------------
select tt.as_user(tt.id('pA'));
select public.send_leads(tt.id('S'), array[tt.cid('X'), tt.cid('Y')]);
select tt.as_postgres();
select tt.eq(tt.inbox('uX', 'clinic_new_lead'), 1, 'X har én clinic_new_lead i klokken');
select tt.eq(tt.inbox('uY', 'clinic_new_lead'), 1, 'Y har én clinic_new_lead i klokken');
select tt.eq(tt.inbox('pA'), 0, 'patienten får ikke klinikkens notifikation');
select tt.eq((select payload from public.user_notifications where user_id = tt.id('uX')),
             jsonb_build_object('leadId', tt.lead('S', 'X')), 'payload har kun leadId');
select tt.eq((select lead_id from public.user_notifications where user_id = tt.id('uX')), tt.lead('S', 'X'), 'lead_id');
select tt.eq((select dedup_key from public.user_notifications where user_id = tt.id('uX')), 'clinic_new_lead:' || tt.lead('S', 'X'), 'dedup_key');

-- Hver bruger ser kun egne rækker.
select tt.as_user(tt.id('uX'));
select tt.rows('select 1 from public.user_notifications', 1, 'X ser sin egen');
select tt.rows('select 1 from public.user_notifications where user_id = ' || quote_literal(tt.id('uY')), 0, 'X ser ikke Y''s');
select tt.as_user(tt.id('uY'));
select tt.rows('select 1 from public.user_notifications', 1, 'Y ser sin egen');
select tt.as_user(tt.id('pA'));
select tt.rows('select 1 from public.user_notifications', 0, 'patient A ser ingen af klinikkernes');
select tt.as_user(tt.id('pB'));
select tt.rows('select 1 from public.user_notifications', 0, 'patient B ser ingen');
select tt.as_anon();
select tt.rows('select 1 from public.user_notifications', 0, 'anon ser ingen');

-- Ingen direkte skrivning.
do $$
declare r text;
begin
  foreach r in array array['pA', 'uX'] loop
    perform tt.as_user(tt.id(r));
    perform tt.denied(format('insert into public.user_notifications (user_id, type) values (%L, %L)', tt.id(r), 'clinic_new_lead'), r || ' kan ikke indsætte', '42501');
    perform tt.denied('update public.user_notifications set read_at = now()', r || ' kan ikke ændre direkte', '42501');
    perform tt.denied('delete from public.user_notifications', r || ' kan ikke slette', '42501');
    perform tt.denied('select public.notification_inbox_add(null, ''clinic_new_lead'', null, null, ''{}'', null)', r || ' kan ikke kalde notification_inbox_add', '42501');
  end loop;
end $$;

-- mark_notifications_read: kun egne, fremmede id'er ændrer intet.
select tt.as_user(tt.id('uX'));
select tt.eq(public.mark_notifications_read(array[(select id from public.user_notifications limit 1), gen_random_uuid()]), 1, 'X markerer sin egen');
select tt.eq(public.mark_notifications_read(), 0, 'alle: intet ulæst tilbage');
select tt.as_postgres();
select tt.eq(tt.inbox('uX', null, true), 0, 'X har ingen ulæste');
select tt.eq(tt.inbox('uY', null, true), 1, 'Y''s er urørt');
select tt.as_user(tt.id('uX'));
select tt.eq(public.mark_notifications_read(array[(select id from public.user_notifications where user_id = tt.id('uY'))]), 0, 'X kan ikke markere Y''s (RLS skjuler dem, og funktionen filtrerer på ejeren)');
select tt.denied('select public.mark_notifications_read(array(select gen_random_uuid() from generate_series(1, 101)))', 'mere end 100 id''er afvises', '22023');
select tt.as_anon();
select tt.denied('select public.mark_notifications_read()', 'anon kan ikke markere', '42501');
select tt.as_user(tt.id('uY'));
select tt.eq(public.mark_notifications_read(), 1, 'Y markerer alle');
select tt.as_postgres();
select tt.eq(tt.inbox('uY', null, true), 0, 'Y har ingen ulæste');

-- ---------------------------------------------------------------------------------------------------------
-- Beskeder: én ulæst række pr. lead og type, også når klinikken har slået e-mail og web push fra
-- ---------------------------------------------------------------------------------------------------------
select tt.as_user(tt.id('uX'));
select public.clinic_decide_lead(tt.lead('S', 'X'), 'accept', 'Velkommen');
select tt.as_postgres();
select tt.eq(tt.inbox('pA', 'patient_lead_answered'), 1, 'accept giver patientens klokke en række');
select tt.eq(tt.ob('pA', 'patient_lead_answered', 'push'), 1, 'og en app-push');
select tt.eq(tt.ob('pA', 'patient_lead_answered', 'email') + tt.ob('pA', 'patient_lead_answered', 'sms'), 0, 'men aldrig e-mail eller SMS');
insert into public.clinic_notification_settings (clinic_id, email_new_message, web_push_new_message, email_new_lead, email_booking_changes)
values (tt.cid('X'), false, false, false, false);
delete from public.notification_outbox;
select tt.as_user(tt.id('pA'));
insert into public.messages (lead_id, sender_id, body) values (tt.lead('S', 'X'), tt.id('pA'), 'Første besked');
insert into public.messages (lead_id, sender_id, body) values (tt.lead('S', 'X'), tt.id('pA'), 'Anden besked');
select tt.as_postgres();
select tt.eq(tt.inbox('uX', 'clinic_new_message'), 1, 'to beskeder giver én ulæst række');
select tt.eq((select count(*)::int from public.notification_outbox where clinic_id = tt.cid('X')), 0, 'klinikken har slået e-mail og web push fra: ingen outbox-række');
select tt.as_user(tt.id('uX'));
select public.mark_notifications_read();
select tt.as_user(tt.id('pA'));
insert into public.messages (lead_id, sender_id, body) values (tt.lead('S', 'X'), tt.id('pA'), 'Tredje besked');
select tt.as_postgres();
select tt.eq(tt.inbox('uX', 'clinic_new_message'), 2, 'efter læsning giver en ny besked en ny række');
select tt.eq(tt.inbox('uX', 'clinic_new_message', true), 1, 'og den er ulæst');
select tt.ok(not exists (select 1 from public.user_notifications n where n.payload::text like '%besked%' or n.payload::text like '%Alma%'),
             'ingen beskedtekst eller navn i klokken');
select tt.as_user(tt.id('uX'));
insert into public.messages (lead_id, sender_id, body) values (tt.lead('S', 'X'), tt.id('uX'), 'Svar 1');
insert into public.messages (lead_id, sender_id, body) values (tt.lead('S', 'X'), tt.id('uX'), 'Svar 2');
select tt.as_postgres();
select tt.eq(tt.inbox('pA', 'patient_new_message', true), 1, 'klinikkens beskeder giver én ulæst række hos patienten');
select tt.eq(tt.ob('pA', 'patient_new_message', 'email') + tt.ob('pA', 'patient_new_message', 'sms'), 0, 'beskeder giver aldrig e-mail eller SMS');
delete from public.clinic_notification_settings where clinic_id = tt.cid('X');

-- ---------------------------------------------------------------------------------------------------------
-- Booking, aflysning og flytning: klokke, e-mail og SMS til patienten
-- ---------------------------------------------------------------------------------------------------------
delete from public.notification_outbox;
select tt.as_user(tt.id('pA'));
select set_config('tt.b1', public.book_slot(tt.lead('S', 'X'), tt.svc('undersoegelse'), tt.slot(3, 10), 'Alma Test', '+45 12345678')::text, true);
select tt.as_postgres();
select tt.eq(tt.inbox('uX', 'clinic_booking_created'), 1, 'klinikkens klokke: ny booking');
select tt.eq(tt.inbox('pA', 'patient_booking_created'), 1, 'patientens klokke: din tid er booket');
select tt.eq(tt.ob('pA', 'patient_booking_created', 'email'), 1, 'e-mail til patienten om booking');
select tt.eq(tt.ob('pA', 'patient_booking_created', 'sms'), 1, 'SMS til patienten om booking');
select tt.eq(tt.ob('pA', 'patient_booking_created', 'push'), 0, 'ingen app-push for patientens egen handling');
select tt.eq((select count(*)::int from public.notification_outbox where recipient_user_id is not null and channel in ('email', 'sms')
                and (payload::text like '%12345678%' or payload::text like '%Alma%' or payload::text like '%@%')), 0,
             'ingen adresse, nummer eller navn i payload');
select tt.eq((select array_agg(k order by k) from public.notification_outbox, jsonb_object_keys(payload) k
               where type = 'patient_booking_created' and channel = 'email'), array['bookingId', 'startsAt'], 'payloadens nøgler');

-- Flyt: én bekræftelse med den nye tid, ingen aflysning.
select tt.as_user(tt.id('pA'));
select public.reschedule_booking(current_setting('tt.b1')::uuid, tt.slot(4, 10));
select tt.as_postgres();
select tt.eq(tt.ob('pA', 'patient_booking_rescheduled', 'email'), 1, 'flyttet tid: e-mail');
select tt.eq(tt.ob('pA', 'patient_booking_rescheduled', 'sms'), 1, 'flyttet tid: SMS');
select tt.eq(tt.ob('pA', 'patient_booking_cancelled_self', 'email'), 0, 'flyttet tid giver ikke en aflysning');
select tt.eq(tt.inbox('pA', 'patient_booking_rescheduled'), 1, 'flyttet tid i klokken');
select tt.eq((select array_agg(k order by k) from public.notification_outbox, jsonb_object_keys(payload) k
               where type = 'patient_booking_rescheduled' and channel = 'sms'), array['bookingId', 'previousStartsAt', 'startsAt'], 'flytning: nøgler');

-- Patientens egen aflysning.
select tt.as_user(tt.id('pA'));
select public.cancel_booking(tt.active_booking(tt.lead('S', 'X')));
select tt.as_postgres();
select tt.eq(tt.ob('pA', 'patient_booking_cancelled_self', 'email'), 1, 'egen aflysning: e-mail');
select tt.eq(tt.ob('pA', 'patient_booking_cancelled_self', 'sms'), 1, 'egen aflysning: SMS');
select tt.eq(tt.ob('pA', 'patient_booking_cancelled_self', 'push'), 0, 'egen aflysning: ingen push');

-- Klinikkens aflysning: push, e-mail og SMS.
select tt.as_user(tt.id('pA'));
select public.book_slot(tt.lead('S', 'X'), tt.svc('undersoegelse'), tt.slot(5, 10), 'Alma Test', '+45 12345678');
select tt.as_user(tt.id('uX'));
select public.cancel_booking(tt.active_booking(tt.lead('S', 'X')), 'Sygdom');
select tt.as_postgres();
select tt.eq(tt.ob('pA', 'patient_booking_cancelled', 'push'), 1, 'klinikkens aflysning: push');
select tt.eq(tt.ob('pA', 'patient_booking_cancelled', 'email'), 1, 'klinikkens aflysning: e-mail');
select tt.eq(tt.ob('pA', 'patient_booking_cancelled', 'sms'), 1, 'klinikkens aflysning: SMS');
select tt.eq(tt.inbox('pA', 'patient_booking_cancelled'), 1, 'klinikkens aflysning: klokke');
select tt.ok(not exists (select 1 from public.user_notifications n where n.payload::text like '%Sygdom%'), 'ingen årsag i klokken');

-- Kun disse typer går som e-mail og SMS.
select tt.eq((select count(*)::int from public.notification_outbox
               where channel in ('email', 'sms') and type::text like 'patient\_%'
                 and type::text not in ('patient_booking_created', 'patient_booking_rescheduled', 'patient_booking_confirmed',
                                        'patient_booking_cancelled', 'patient_booking_cancelled_self', 'patient_booking_reminder',
                                        'patient_review_reminder')), 0, 'andre typer giver aldrig e-mail eller SMS');
select tt.eq((select count(*)::int from public.notification_outbox where channel = 'sms' and clinic_id is not null), 0, 'klinikker får aldrig SMS');

-- ---------------------------------------------------------------------------------------------------------
-- En fejl i klokken ruller ikke handlingen tilbage
-- ---------------------------------------------------------------------------------------------------------
alter table public.user_notifications add constraint tt_fail_all check (false) not valid;
select tt.as_user(tt.id('pA'));
select public.book_slot(tt.lead('S', 'X'), tt.svc('undersoegelse'), tt.slot(6, 10), 'Alma Test', '+45 12345678');
select tt.as_postgres();
select tt.ok(exists (select 1 from public.bookings where lead_id = tt.lead('S', 'X') and status = 'booked'), 'bookingen står, selv om klokken fejlede');
select tt.ok(exists (select 1 from public.notification_outbox where type = 'clinic_booking_created' and booking_id = tt.active_booking(tt.lead('S', 'X'))), 'outboxen fik stadig sin række');
alter table public.user_notifications drop constraint tt_fail_all;

-- ---------------------------------------------------------------------------------------------------------
-- patient_notification_contacts
-- ---------------------------------------------------------------------------------------------------------
select tt.as_user(tt.id('pA'));
insert into public.patient_notification_contacts (patient_id, email, phone) values (tt.id('pA'), 'lea@example.com', '+45 12 34 56 78');
select tt.rows('select 1 from public.patient_notification_contacts', 1, 'A ser sin række');
select tt.as_user(tt.id('pB'));
select tt.rows('select 1 from public.patient_notification_contacts', 0, 'B ser ikke A''s');
select tt.affects('update public.patient_notification_contacts set phone = null', 0, 'B kan ikke ændre A''s');
select tt.affects('delete from public.patient_notification_contacts', 0, 'B kan ikke slette A''s');
select tt.denied(format('insert into public.patient_notification_contacts (patient_id, email) values (%L, %L)', tt.id('pA'), 'x@example.com'), 'B kan ikke oprette for A', '42501');
select tt.as_user(tt.id('uX'));
select tt.rows('select 1 from public.patient_notification_contacts', 0, 'klinik ser ingen');
select tt.denied(format('insert into public.patient_notification_contacts (patient_id, phone) values (%L, %L)', tt.id('uX'), '+45 12 34 56 78'), 'klinik kan ikke oprette');
select tt.as_user(tt.id('pAnon'), true);
select tt.denied(format('insert into public.patient_notification_contacts (patient_id, phone) values (%L, %L)', tt.id('pAnon'), '+45 12 34 56 78'), 'anonym kan ikke oprette', '42501');
select tt.as_anon();
select tt.rows('select 1 from public.patient_notification_contacts', 0, 'anon ser ingen');
select tt.as_user(tt.id('pB'));
select tt.denied(format('insert into public.patient_notification_contacts (patient_id, phone) values (%L, %L)', tt.id('pB'), '123'), 'ugyldigt nummer afvises', '23514');
select tt.denied(format('insert into public.patient_notification_contacts (patient_id, email) values (%L, %L)', tt.id('pB'), 'ikke-en-mail'), 'ugyldig e-mail afvises', '23514');
select tt.denied(format('insert into public.patient_notification_contacts (patient_id, email) values (%L, %L)', tt.id('pB'), repeat('a', 250) || '@example.com'), 'for lang e-mail afvises', '23514');
select tt.as_user(tt.id('pA'));
select tt.denied(format('update public.patient_notification_contacts set patient_id = %L', tt.id('pB')), 'ejerskabet kan ikke flyttes', '42501');
-- Klinikkens kontaktoplysninger er uændrede: ingen klinikfunktion læser patient_notification_contacts.
select tt.as_postgres();
select tt.ok(not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'clinic\_%' and p.prosrc like '%patient_notification_contacts%'
), 'ingen klinikfunktion bruger patient_notification_contacts');

-- claim_notifications slår adresse og nummer op ved afsendelsen.
select tt.as_service();
create temp table claimed as select * from public.claim_notifications(100);
select tt.as_postgres();
select tt.ok(exists (select 1 from claimed c where c.channel = 'email' and c.recipient_user_id = tt.id('pA') and c.to_email = 'lea@example.com'), 'patientens valgte e-mail bruges');
select tt.ok(exists (select 1 from claimed c where c.channel = 'sms' and c.recipient_user_id = tt.id('pA') and c.to_phone = '+45 12 34 56 78'), 'patientens valgte nummer bruges');
select tt.ok(not exists (select 1 from claimed c where c.channel = 'email' and c.clinic_id is not null and c.to_email like '%lea@%'), 'klinikkens e-mail er klinikejerens');
select tt.ok(not exists (select 1 from claimed c where c.channel = 'sms' and c.to_phone is null and c.recipient_user_id = tt.id('pA')), 'A har et nummer til alle SMS''er');

-- Uden valg: login-e-mailen, og intet nummer.
delete from public.patient_notification_contacts where patient_id = tt.id('pA');
update public.notification_outbox set status = 'pending', locked_until = null where status = 'sending';
select tt.as_service();
drop table claimed;
create temp table claimed as select * from public.claim_notifications(100);
select tt.as_postgres();
select tt.ok(exists (select 1 from claimed c where c.channel = 'email' and c.recipient_user_id = tt.id('pA') and c.to_email = 'pa@test.invalid'), 'uden valg bruges login-e-mailen');
select tt.ok(not exists (select 1 from claimed c where c.channel = 'sms' and c.to_phone is not null), 'uden valg er der intet nummer');

-- Sletning af kontoen sletter kontaktoplysninger og klokke.
insert into public.patient_notification_contacts (patient_id, phone) values (tt.id('pA'), '+45 12 34 56 78');
delete from auth.users where id = tt.id('pA');
select tt.eq((select count(*)::int from public.patient_notification_contacts where patient_id = tt.id('pA')), 0, 'kontaktoplysninger slettes med kontoen');
select tt.eq(tt.inbox('pA'), 0, 'klokken slettes med kontoen');

-- ---------------------------------------------------------------------------------------------------------
-- Påmindelse om anmeldelse
-- ---------------------------------------------------------------------------------------------------------
select tt.as_postgres();
delete from public.notification_outbox;
delete from public.user_notifications;
select tt.mk_case('pB', 'V_ok');
select tt.mk_case('pB', 'V_young');
select tt.mk_case('pB', 'V_noshow');
select tt.mk_case('pB', 'V_cancelled');
select tt.mk_case('pB', 'V_old');
select tt.mk_case('pB', 'V_reviewed');
create function pg_temp.bk(p_case text, p_starts timestamptz, p_status public.booking_status) returns uuid language plpgsql as $$
declare v uuid;
begin
  v := tt.mk_booking(tt.mk_lead(p_case, 'X', case when p_status = 'cancelled' then 'accepted'::public.lead_status else 'booked'::public.lead_status end), 'undersoegelse', p_starts, p_status);
  update public.bookings set patient_id = tt.id('pB') where id = v;
  return v;
end $$;
select pg_temp.bk('V_ok', now() - interval '26 hours', 'booked');
select pg_temp.bk('V_young', now() - interval '23 hours 30 minutes', 'booked');
select pg_temp.bk('V_noshow', now() - interval '26 hours', 'no_show');
select pg_temp.bk('V_cancelled', now() - interval '26 hours', 'cancelled');
select pg_temp.bk('V_old', now() - interval '6 days', 'booked');
select set_config('tt.rev', pg_temp.bk('V_reviewed', now() - interval '27 hours', 'booked')::text, true);
select tt.as_user(tt.id('pB'));
insert into public.reviews (booking_id, patient_id, stars, text, price_accuracy)
values (current_setting('tt.rev')::uuid, tt.id('pB'), 4, 'Fin behandling og klar kommunikation om prisen.', 'as_quoted');
select tt.as_postgres();
delete from public.notification_outbox;
delete from public.user_notifications;

select tt.as_user(tt.id('pB'));
select tt.denied('select public.enqueue_review_reminders()', 'patient kan ikke kalde enqueue_review_reminders', '42501');
select tt.as_user(tt.id('uX'));
select tt.denied('select public.enqueue_review_reminders()', 'klinik kan ikke kalde enqueue_review_reminders', '42501');
select tt.as_service();
select tt.eq(public.enqueue_review_reminders(), 1, 'kun det ene gennemførte besøg uden anmeldelse får en påmindelse');
select tt.eq(public.enqueue_review_reminders(), 0, 'idempotent: højst én gang');
select tt.as_postgres();
select tt.eq(tt.inbox('pB', 'patient_review_reminder'), 1, 'anmeldelsespåmindelsen i klokken');
select tt.eq(tt.ob('pB', 'patient_review_reminder', 'email'), 1, 'e-mail');
select tt.eq(tt.ob('pB', 'patient_review_reminder', 'sms'), 1, 'SMS');
select tt.eq(tt.ob('pB', 'patient_review_reminder', 'push'), 0, 'ingen app-push');
select tt.eq((select count(*)::int from public.user_notifications where type = 'patient_review_reminder' and booking_id = (select id from public.bookings where lead_id = tt.lead('V_ok', 'X'))), 1, 'for V_ok');

rollback;
