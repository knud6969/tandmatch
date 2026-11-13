-- Test 60: notification_outbox, triggerne, claim/complete/purge og påmindelser (platform 14, RLS-punkt 55,
-- migration 20261105000200).
begin;
\ir _helpers.sql
\ir _fixtures.sql

-- Tæller outbox-rækker uanset rolle (outboxen er ellers lukket for alle klientroller). Patientens e-mail- og SMS-rækker
-- (migration 20261108000300, test 67) tælles ikke med her; de har deres egen test.
create function tt.n(p_type text default null, p_lead uuid default null) returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.notification_outbox o
   where (p_type is null or o.type::text = p_type) and (p_lead is null or o.lead_id = p_lead)
     and not (o.type::text like 'patient\_%' and o.channel::text in ('email', 'sms'))
     and o.type::text not in ('patient_booking_created', 'patient_booking_rescheduled', 'patient_booking_cancelled_self', 'patient_review_reminder')
$$;
grant execute on function tt.n(text, uuid) to public;
-- Den aktive (booked) booking på et lead; tt.booking() er tvetydig, når flere bookinger oprettes i samme transaktion.
create function tt.active_booking(p_lead uuid) returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.bookings where lead_id = p_lead and status = 'booked'
$$;
grant execute on function tt.active_booking(uuid) to public;

-- Fixtures indsætter selv leads (mk_lead) i nogle tests; her starter vi med en tom outbox.
delete from public.notification_outbox;

-- ---------------------------------------------------------------------------------------------------------
-- Lukket for klientroller
-- ---------------------------------------------------------------------------------------------------------
select tt.as_user(tt.id('pA'));
select public.send_leads(tt.id('S'), array[tt.cid('X'), tt.cid('Y')]);

select tt.as_postgres();
select tt.eq(tt.n('clinic_new_lead'), 2, 'ét clinic_new_lead pr. lead');
select tt.eq(tt.n(), 2, 'ingen andre rækker efter send_leads');
select tt.eq(tt.n('clinic_new_lead', tt.lead('S', 'X')), 1, 'X har sin række');
select tt.eq((select payload from public.notification_outbox where lead_id = tt.lead('S', 'X')),
             jsonb_build_object('leadId', tt.lead('S', 'X')), 'payload har kun leadId (ikke akut)');
select tt.eq((select dedup_key from public.notification_outbox where lead_id = tt.lead('S', 'X')),
             'clinic_new_lead:' || tt.lead('S', 'X'), 'dedup_key');
select tt.eq((select clinic_id from public.notification_outbox where lead_id = tt.lead('S', 'X')), tt.cid('X'), 'klinik-id');
select tt.ok((select recipient_user_id from public.notification_outbox where lead_id = tt.lead('S', 'X')) is null, 'ingen patient på e-mailrækken');

-- Ingen klientrolle kan læse, indsætte, ændre eller slette i outboxen eller kalde funktionerne.
do $$
declare r text;
begin
  foreach r in array array['anon', 'pA', 'uX', 'adm'] loop
    if r = 'anon' then perform tt.as_anon();
    elsif r = 'adm' then
      perform tt.as_postgres();
      insert into auth.users (id, email, is_anonymous, raw_user_meta_data) values (tt.id('adm'), 'adm@test.invalid', false, '{"role":"patient"}');
      update public.profiles set role = 'admin' where id = tt.id('adm');
      perform tt.as_user(tt.id('adm'));
    else perform tt.as_user(tt.id(r)); end if;
    perform tt.rows('select 1 from public.notification_outbox', 0, r || ' ser ingen outbox-rækker');
    perform tt.denied('insert into public.notification_outbox (type, channel, clinic_id) values (''clinic_new_lead'', ''email'', ''' || tt.cid('X') || ''')', r || ' kan ikke indsætte');
    perform tt.denied('update public.notification_outbox set status = ''sent''', r || ' kan ikke ændre');
    perform tt.denied('delete from public.notification_outbox', r || ' kan ikke slette');
    perform tt.denied('select * from public.claim_notifications()', r || ' kan ikke kalde claim_notifications', '42501');
    perform tt.denied('select public.complete_notification(gen_random_uuid(), ''sent'')', r || ' kan ikke kalde complete_notification', '42501');
    perform tt.denied('select public.purge_notifications()', r || ' kan ikke kalde purge_notifications', '42501');
    perform tt.denied('select public.enqueue_booking_reminders()', r || ' kan ikke kalde enqueue_booking_reminders', '42501');
    perform tt.denied('select public.notification_enqueue(''clinic_new_lead'', null, null, null, null, ''{}'', null)', r || ' kan ikke kalde notification_enqueue', '42501');
    perform tt.denied('select public.notify_after_message()', r || ' kan ikke kalde triggerfunktionen', '42501');
  end loop;
end $$;

-- payload: kun de tilladte nøgler.
select tt.as_postgres();
select tt.denied(format('insert into public.notification_outbox (type, channel, clinic_id, payload) values (%L, %L, %L, %L)',
                        'clinic_new_lead', 'email', tt.cid('X'), '{"name":"Alma"}'), 'payload med navn afvises', '23514');
select tt.denied(format('insert into public.notification_outbox (type, channel, clinic_id, payload) values (%L, %L, %L, %L)',
                        'clinic_new_lead', 'email', tt.cid('X'), '{"summary":"hul i tand"}'), 'payload med opsummering afvises', '23514');
select tt.denied(format('insert into public.notification_outbox (type, channel, recipient_user_id) values (%L, %L, %L)',
                        'clinic_new_lead', 'push', tt.id('pA')), 'kanal og type skal passe sammen', '23514');
select tt.denied(format('insert into public.notification_outbox (type, channel, clinic_id, recipient_user_id) values (%L, %L, %L, %L)',
                        'clinic_new_lead', 'email', tt.cid('X'), tt.id('pA')), 'kun én modtager', '23514');

-- ---------------------------------------------------------------------------------------------------------
-- Beskeder og dæmpning
-- ---------------------------------------------------------------------------------------------------------
select tt.as_user(tt.id('pA'));
insert into public.messages (lead_id, sender_id, body) values (tt.lead('S', 'X'), tt.id('pA'), 'Første besked fra patienten');
insert into public.messages (lead_id, sender_id, body) values (tt.lead('S', 'X'), tt.id('pA'), 'Anden besked fra patienten');
select tt.eq(tt.n('clinic_new_message', tt.lead('S', 'X')), 1, 'to patientbeskeder inden for 15 min giver én række');
select tt.as_postgres();
select tt.eq((select payload from public.notification_outbox where type = 'clinic_new_message'),
             jsonb_build_object('leadId', tt.lead('S', 'X')), 'payload uden beskedtekst');
-- Efter 15 minutter kan en ny række lægges.
select tt.as_postgres();
update public.notification_outbox set created_at = now() - interval '20 minutes' where type = 'clinic_new_message';
select tt.as_user(tt.id('pA'));
insert into public.messages (lead_id, sender_id, body) values (tt.lead('S', 'X'), tt.id('pA'), 'Tredje besked fra patienten');
select tt.eq(tt.n('clinic_new_message', tt.lead('S', 'X')), 2, 'ny række efter 15 minutter');
-- Beskeden til et andet lead dæmpes ikke af det første.
insert into public.messages (lead_id, sender_id, body) values (tt.lead('S', 'Y'), tt.id('pA'), 'Besked til Y');
select tt.eq(tt.n('clinic_new_message', tt.lead('S', 'Y')), 1, 'dæmpning gælder pr. lead');

-- Klinikkens accept og besked
select tt.as_user(tt.id('uX'));
select public.clinic_decide_lead(tt.lead('S', 'X'), 'accept', 'Velkommen');
insert into public.messages (lead_id, sender_id, body) values (tt.lead('S', 'X'), tt.id('uX'), 'Besked fra klinikken 1');
insert into public.messages (lead_id, sender_id, body) values (tt.lead('S', 'X'), tt.id('uX'), 'Besked fra klinikken 2');
select tt.as_postgres();
select tt.eq(tt.n('patient_lead_answered', tt.lead('S', 'X')), 1, 'accept giver patient_lead_answered');
select tt.eq(tt.n('patient_new_message', tt.lead('S', 'X')), 1, 'to klinikbeskeder giver én patient_new_message');
select tt.eq((select payload from public.notification_outbox where type = 'patient_lead_answered'),
             jsonb_build_object('caseId', tt.id('S'), 'leadId', tt.lead('S', 'X')), 'payload: sag og lead');
select tt.eq((select recipient_user_id from public.notification_outbox where type = 'patient_lead_answered'), tt.id('pA'), 'modtager er patienten');
select tt.ok((select clinic_id from public.notification_outbox where type = 'patient_lead_answered') is null, 'push har ikke klinik-id');

-- Afvisning
select tt.as_user(tt.id('uY'));
select public.clinic_decide_lead(tt.lead('S', 'Y'), 'decline', null, null, null, 'no_capacity');
select tt.as_postgres();
select tt.eq(tt.n('patient_lead_answered', tt.lead('S', 'Y')), 1, 'afvisning giver patient_lead_answered');

-- ---------------------------------------------------------------------------------------------------------
-- Booking og aflysning
-- ---------------------------------------------------------------------------------------------------------
select tt.as_user(tt.id('pA'));
select public.book_slot(tt.lead('S', 'X'), tt.svc('undersoegelse'), tt.slot(3, 10), 'Alma Test', '+45 12345678');
select tt.as_postgres();
select tt.eq(tt.n('clinic_booking_created', tt.lead('S', 'X')), 1, 'book_slot giver clinic_booking_created');
select tt.eq((select (payload ->> 'startsAt')::timestamptz from public.notification_outbox where type = 'clinic_booking_created'),
             tt.slot(3, 10), 'startsAt i payload');
select tt.eq((select array_agg(k order by k) from public.notification_outbox, jsonb_object_keys(payload) k where type = 'clinic_booking_created'),
             array['bookingId', 'leadId', 'startsAt'], 'payloadens nøgler');

select tt.as_user(tt.id('pA'));
select public.cancel_booking(tt.booking(tt.lead('S', 'X')));
select tt.eq(tt.n('clinic_booking_cancelled', tt.lead('S', 'X')), 1, 'patientens aflysning giver clinic_booking_cancelled');
select tt.eq(tt.n('patient_booking_cancelled', tt.lead('S', 'X')), 0, 'og ingen patient_booking_cancelled');

select public.book_slot(tt.lead('S', 'X'), tt.svc('undersoegelse'), tt.slot(4, 10), 'Alma Test', '+45 12345678');
select tt.as_user(tt.id('uX'));
select public.cancel_booking(tt.active_booking(tt.lead('S', 'X')), 'Sygdom');
select tt.eq(tt.n('patient_booking_cancelled', tt.lead('S', 'X')), 1, 'klinikkens aflysning giver patient_booking_cancelled');
select tt.eq(tt.n('clinic_booking_created', tt.lead('S', 'X')), 2, 'den anden booking gav også en række');
select tt.eq(tt.n('clinic_booking_cancelled', tt.lead('S', 'X')), 1, 'klinikkens aflysning giver ikke clinic_booking_cancelled');
select tt.as_postgres();
select tt.ok(not exists (select 1 from public.notification_outbox o where o.payload::text like '%Sygdom%' or o.payload::text like '%Alma%'
                                 or o.payload::text like '%12345678%'), 'ingen navne, telefon eller årsag i payload');

-- ---------------------------------------------------------------------------------------------------------
-- Akut: nyt lead uden frist; klinikkens forslag (held) giver patient_lead_answered og ingen booking-række; patientens
-- bekræftelse (held -> booked) giver clinic_booking_created; afvisning giver ingen booking-række
-- ---------------------------------------------------------------------------------------------------------
select tt.as_user(tt.id('pB'));
select * from public.send_emergency_lead(tt.cid('Z'), tt.svc('akut_konsultation'), 'Jeg har slemme smerter i en kindtand.', 'Bo Test', '+45 87654321', '2100');
select * from public.send_emergency_lead(tt.cid('W'), tt.svc('akut_konsultation'), 'Jeg har slemme smerter i en kindtand.', 'Bo Test', '+45 87654321', '2100');
select tt.as_postgres();
create temp table akut as
  select l.id as lead_id, l.clinic_id, l.case_id from public.leads l join public.cases c on c.id = l.case_id where c.is_emergency;
grant select on akut to public;
select tt.eq(tt.n('clinic_new_lead', (select lead_id from akut where clinic_id = tt.cid('Z'))), 1, 'akut: clinic_new_lead');
select tt.ok((select not (o.payload ? 'holdExpiresAt') from public.notification_outbox o where o.lead_id = (select lead_id from akut where clinic_id = tt.cid('Z'))),
             'akut: ingen holdExpiresAt (der er ingen reservation ved afsendelse)');

select tt.as_user(tt.id('uZ'));
select public.clinic_decide_lead((select lead_id from akut where clinic_id = tt.cid('Z')), 'accept', p_proposed_starts_at => tt.slot(3, 18));
select tt.as_user(tt.id('uW'));
select public.clinic_decide_lead((select lead_id from akut where clinic_id = tt.cid('W')), 'decline', null, null, null, 'no_capacity');
select tt.as_postgres();
select tt.eq(tt.n('patient_lead_answered', (select lead_id from akut where clinic_id = tt.cid('Z'))), 1, 'forslaget giver patient_lead_answered');
select tt.eq(tt.n('clinic_booking_created'), 2, 'et forslag (held) giver ingen clinic_booking_created (kun de to fra før)');
select tt.eq(tt.n('patient_lead_answered', (select lead_id from akut where clinic_id = tt.cid('W'))), 1, 'akut afvisning giver patient_lead_answered');

select tt.as_user(tt.id('pB'));
select public.confirm_held_booking((select b.id from public.bookings b where b.lead_id = (select lead_id from akut where clinic_id = tt.cid('Z'))));
select tt.as_postgres();
select tt.eq(tt.n('clinic_booking_created', (select lead_id from akut where clinic_id = tt.cid('Z'))), 1, 'bekræftelsen giver clinic_booking_created');
select tt.eq((select count(*)::int from public.notification_outbox o where o.type = 'patient_booking_created'
               and o.lead_id = (select lead_id from akut where clinic_id = tt.cid('Z')) and o.channel = 'email'), 1, 'og patient_booking_created (e-mail; ingen push for egen handling)');
select tt.eq(tt.n('patient_booking_confirmed'), 0, 'patient_booking_confirmed bruges ikke længere');
select tt.eq(tt.n('clinic_booking_cancelled'), 1, 'ingen ny clinic_booking_cancelled');

-- ---------------------------------------------------------------------------------------------------------
-- Ingen række: tilbagetrækning, luk sag, udløbet reservation
-- ---------------------------------------------------------------------------------------------------------
select tt.mk_case('pA', 'Q1');
select tt.mk_case('pA', 'Q2');
select tt.mk_case('pA', 'Q3');
select tt.mk_lead('Q1', 'A1', 'sent');
select tt.mk_lead('Q2', 'A1', 'sent');
select tt.mk_booking(tt.mk_lead('Q3', 'A1', 'sent'), 'akut_konsultation', now() + interval '2 hours', 'held', 30, now() - interval '1 minute');
delete from public.notification_outbox where lead_id in (tt.lead('Q1', 'A1'), tt.lead('Q2', 'A1'), tt.lead('Q3', 'A1'));
create temp table before_count as select tt.n() as n;
grant select on before_count to public;
select tt.as_user(tt.id('pA'));
select public.withdraw_lead(tt.lead('Q1', 'A1'));
select public.close_case(tt.id('Q2'));
select tt.as_service();
select * from public.complete_due_bookings();
select tt.as_postgres();
select tt.eq(tt.n(), (select n from before_count), 'withdraw_lead, close_case og udløbet reservation giver ingen rækker');

-- ---------------------------------------------------------------------------------------------------------
-- Klinikkens indstillinger
-- ---------------------------------------------------------------------------------------------------------
select tt.as_user(tt.id('uX'));
insert into public.clinic_notification_settings (clinic_id, email_new_lead, email_new_message, email_booking_changes, email_booking_reminder)
values (tt.cid('X'), false, false, false, false);
select tt.as_user(tt.id('pB'));
-- SB har allerede ingen leads; send til X og Y.
select public.send_leads(tt.id('SB'), array[tt.cid('X'), tt.cid('Y')]);
select tt.eq(tt.n('clinic_new_lead', tt.lead('SB', 'X')), 0, 'email_new_lead slået fra giver ingen række');
select tt.eq(tt.n('clinic_new_lead', tt.lead('SB', 'Y')), 1, 'Y (uden indstillingsrække) får sin række');
select tt.as_user(tt.id('uX'));
select public.clinic_decide_lead(tt.lead('SB', 'X'), 'accept');
select tt.as_user(tt.id('pB'));
insert into public.messages (lead_id, sender_id, body) values (tt.lead('SB', 'X'), tt.id('pB'), 'Besked til X');
select public.book_slot(tt.lead('SB', 'X'), tt.svc('undersoegelse'), tt.slot(5, 10), 'Bo Test', '+45 87654321');
select tt.eq(tt.n('clinic_new_message', tt.lead('SB', 'X')), 0, 'email_new_message slået fra');
select tt.eq(tt.n('clinic_booking_created', tt.lead('SB', 'X')), 0, 'email_booking_changes slået fra');
select tt.eq(tt.n('patient_lead_answered', tt.lead('SB', 'X')), 1, 'push påvirkes ikke af klinikkens e-mailvalg');

-- ---------------------------------------------------------------------------------------------------------
-- En fejl i enqueue ruller ikke handlingen tilbage
-- ---------------------------------------------------------------------------------------------------------
select tt.as_postgres();
alter table public.notification_outbox add constraint tmp_always_fails check (false) not valid;
select tt.as_user(tt.id('pB'));
select tt.allowed(format('select public.book_slot(%L, %L, %L, %L, %L)', tt.lead('SB', 'Y'), tt.svc('undersoegelse'), tt.slot(6, 10), 'Bo Test', '+45 87654321'),
                  'ingen: Y er ikke accepteret endnu') where false;
select tt.as_user(tt.id('uY'));
select public.clinic_decide_lead(tt.lead('SB', 'Y'), 'accept');  -- fejlen i enqueue ruller ikke accepten tilbage
select tt.as_user(tt.id('pB'));
select public.book_slot(tt.lead('SB', 'Y'), tt.svc('undersoegelse'), tt.slot(6, 10), 'Bo Test', '+45 87654321');
select tt.as_postgres();
select tt.eq((select status::text from public.leads where id = tt.lead('SB', 'Y')), 'booked', 'bookingen lykkedes trods fejl i enqueue');
select tt.eq(tt.n('clinic_booking_created', tt.lead('SB', 'Y')), 0, 'og der blev ikke lagt en række');
alter table public.notification_outbox drop constraint tmp_always_fails;

-- ---------------------------------------------------------------------------------------------------------
-- Sletning af klinikkonto: patienten får push om aflyst tid og besvaret lead
-- ---------------------------------------------------------------------------------------------------------
select tt.mk_case('pA', 'Q5');
select tt.mk_case('pA', 'Q6');
select tt.mk_booking(tt.mk_lead('Q5', 'A1', 'booked'), 'undersoegelse', tt.slot(7, 10), 'booked');
select tt.mk_lead('Q6', 'A1', 'sent');
delete from public.notification_outbox where lead_id in (tt.lead('Q5', 'A1'), tt.lead('Q6', 'A1'));
delete from auth.users where id = tt.id('uA1');
select tt.eq(tt.n('patient_booking_cancelled', tt.lead('Q5', 'A1')), 1, 'sletning af klinikkonto: patient_booking_cancelled');
select tt.eq(tt.n('patient_lead_answered', tt.lead('Q6', 'A1')), 1, 'sletning af klinikkonto: patient_lead_answered for sendt lead');
select tt.eq(tt.n('patient_lead_answered', tt.lead('Q5', 'A1')), 0, 'booked lead var allerede besvaret');

-- ---------------------------------------------------------------------------------------------------------
-- claim_notifications: modtagere
-- ---------------------------------------------------------------------------------------------------------
delete from public.notification_outbox;
-- To nye leads til A2 (verificeret, ejer uA2) og A3 (bliver ikke-verificeret).
select tt.mk_case('pA', 'C1');
select tt.mk_case('pA', 'C2');
select tt.mk_case('pA', 'C3');
select tt.mk_lead('C1', 'A2');
select tt.mk_lead('C2', 'A3');
select tt.mk_lead('C3', 'A4');
select tt.eq(tt.n('clinic_new_lead'), 3, 'tre nye clinic_new_lead');
-- A3 bliver registered; A4's lead er "sendt før ejerskabet".
select public.admin_set_clinic_status(tt.cid('A3'), 'registered');
alter table public.leads disable trigger leads_before_update;
update public.leads set sent_at = (select owner_since from public.clinics where id = tt.cid('A4')) - interval '1 day' where id = tt.lead('C3', 'A4');
alter table public.leads enable trigger leads_before_update;
-- pA har to tokens.
select tt.as_user(tt.id('pA'));
select public.register_push_token('ExponentPushToken[claimtoken00000001]', 'ios');
select public.register_push_token('ExponentPushToken[claimtoken00000002]', 'ios');
select tt.as_postgres();
insert into public.notification_outbox (type, channel, recipient_user_id, payload)
values ('patient_booking_reminder', 'push', tt.id('pA'), '{}'), ('patient_booking_reminder', 'push', tt.id('pC'), '{}');

select tt.as_service();
create temp table claimed as select * from public.claim_notifications(50);
select tt.as_postgres();
select tt.eq((select count(*)::int from claimed), 5, 'fem rækker claimet');
select tt.eq((select to_email from claimed where payload ->> 'leadId' = tt.lead('C1', 'A2')::text), 'klinik-a2@test.invalid', 'e-mail til ejerens login');
select tt.ok((select to_email from claimed where payload ->> 'leadId' = tt.lead('C2', 'A3')::text) is null, 'ingen e-mail for en ikke-verificeret klinik');
select tt.ok((select to_email from claimed where payload ->> 'leadId' = tt.lead('C3', 'A4')::text) is null, 'ingen e-mail for et lead sendt før ejerskabet');
select tt.eq((select cardinality(push_tokens) from claimed c join public.notification_outbox o on o.id = c.id where o.recipient_user_id = tt.id('pA')), 2, 'to tokens til pA');
select tt.eq((select cardinality(push_tokens) from claimed c join public.notification_outbox o on o.id = c.id where o.recipient_user_id = tt.id('pC')), 0, 'ingen tokens til pC');
select tt.ok((select bool_and(to_email is null) from claimed c where c.channel = 'push'), 'push har ingen e-mail');
select tt.ok((select bool_and(push_tokens is null) from claimed c where c.channel = 'email'), 'e-mail har ingen tokens');
select tt.eq((select count(*)::int from public.notification_outbox where status = 'sending' and attempts = 1 and locked_until > now()), 5, 'rækkerne er låst og attempts = 1');
-- Et nyt kald tager ikke de låste rækker igen.
select tt.as_service();
select tt.eq((select count(*)::int from public.claim_notifications(50)), 0, 'låste rækker tages ikke igen');
select tt.as_postgres();

-- Ejeren fjernet: ingen e-mail.
update public.notification_outbox set status = 'pending', locked_until = null where type = 'clinic_new_lead';
delete from auth.users where id = tt.id('uA2');
select tt.as_service();
select tt.ok((select to_email from public.claim_notifications(50) where channel = 'email' and payload ->> 'leadId' = tt.lead('C1', 'A2')::text) is null, 'ingen e-mail uden ejer');

-- ---------------------------------------------------------------------------------------------------------
-- complete_notification
-- ---------------------------------------------------------------------------------------------------------
select tt.as_postgres();
delete from public.notification_outbox;
insert into public.notification_outbox (id, type, channel, recipient_user_id, payload, status, attempts, locked_until)
values (tt.id('o1'), 'patient_booking_reminder', 'push', tt.id('pA'), '{}', 'sending', 1, now() + interval '2 minutes'),
       (tt.id('o2'), 'patient_booking_reminder', 'push', tt.id('pA'), '{}', 'sending', 5, now() + interval '2 minutes'),
       (tt.id('o3'), 'patient_booking_reminder', 'push', tt.id('pA'), '{}', 'sending', 1, now() + interval '2 minutes'),
       (tt.id('o4'), 'patient_booking_reminder', 'push', tt.id('pA'), '{}', 'sending', 1, now() + interval '2 minutes'),
       (tt.id('o5'), 'patient_booking_reminder', 'push', tt.id('pA'), '{}', 'pending', 0, null);
select tt.as_service();
select public.complete_notification(tt.id('o1'), 'retry', 'RESEND_429');
select public.complete_notification(tt.id('o2'), 'retry', 'RESEND_500');
select public.complete_notification(tt.id('o3'), 'sent');
select public.complete_notification(tt.id('o4'), 'skipped', 'to: alma@test.invalid');
select public.complete_notification(tt.id('o5'), 'sent');  -- ikke 'sending': uændret
select tt.as_postgres();
select tt.eq((select status::text from public.notification_outbox where id = tt.id('o1')), 'pending', 'retry giver pending');
select tt.ok((select next_attempt_at from public.notification_outbox where id = tt.id('o1')) > now() + interval '30 seconds', 'udskudt');
select tt.eq((select last_error from public.notification_outbox where id = tt.id('o1')), 'RESEND_429', 'fejlkode gemt');
select tt.eq((select status::text from public.notification_outbox where id = tt.id('o2')), 'failed', 'retry efter 5 forsøg giver failed');
select tt.eq((select status::text from public.notification_outbox where id = tt.id('o3')), 'sent', 'sent');
select tt.ok((select sent_at from public.notification_outbox where id = tt.id('o3')) is not null, 'sent_at sat');
select tt.ok((select last_error from public.notification_outbox where id = tt.id('o4')) is null, 'en fejlkode, der ikke er en kode, gemmes ikke (ingen adresse)');
select tt.eq((select status::text from public.notification_outbox where id = tt.id('o5')), 'pending', 'kun sending-rækker afsluttes');
select tt.as_service();
select tt.denied('select public.complete_notification(gen_random_uuid(), ''banan'')', 'ukendt status afvises', '22023');
select tt.as_postgres();

-- Ugyldige tokens slettes kun for rækkens modtager.
insert into public.notification_outbox (id, type, channel, recipient_user_id, payload, status, attempts, locked_until)
values (tt.id('o6'), 'patient_booking_reminder', 'push', tt.id('pA'), '{}', 'sending', 1, now() + interval '2 minutes');
select tt.as_user(tt.id('pB'));
select public.register_push_token('ExponentPushToken[claimtoken00000003]', 'ios');
select tt.as_service();
select public.complete_notification(tt.id('o6'), 'sent', null, array['ExponentPushToken[claimtoken00000001]', 'ExponentPushToken[claimtoken00000003]']);
select tt.as_postgres();
select tt.eq((select count(*)::int from public.push_tokens where token = 'ExponentPushToken[claimtoken00000001]'), 0, 'pA''s ugyldige token slettet');
select tt.eq((select count(*)::int from public.push_tokens where token = 'ExponentPushToken[claimtoken00000003]'), 1, 'pB''s token røres ikke');

-- Udløbet lås: tages igen; efter 5 forsøg opgives rækken.
update public.notification_outbox set status = 'sending', attempts = 2, locked_until = now() - interval '1 minute' where id = tt.id('o5');
update public.notification_outbox set status = 'sending', attempts = 5, locked_until = now() - interval '1 minute' where id = tt.id('o1');
select tt.as_service();
select tt.eq((select count(*)::int from public.claim_notifications(50) where id = tt.id('o5')), 1, 'række med udløbet lås tages igen');
select tt.as_postgres();
select tt.eq((select attempts::int from public.notification_outbox where id = tt.id('o5')), 3, 'attempts tælles op');
select tt.eq((select status::text || ':' || last_error from public.notification_outbox where id = tt.id('o1')), 'failed:LOCK_EXPIRED', 'opgivet efter 5 forsøg');

-- purge
update public.notification_outbox set created_at = now() - interval '31 days' where id in (tt.id('o2'), tt.id('o3'), tt.id('o5'));
select tt.as_service();
select tt.eq(public.purge_notifications(), 2, 'purge sletter afsluttede rækker ældre end 30 dage (ikke en sending-række)');
select tt.as_postgres();

-- ---------------------------------------------------------------------------------------------------------
-- Påmindelser
-- ---------------------------------------------------------------------------------------------------------
delete from public.notification_outbox;
select tt.mk_case('pA', 'R1');
select tt.mk_case('pA', 'R2');
select tt.mk_case('pA', 'R3');
select tt.mk_case('pA', 'R4');
select tt.mk_booking(tt.mk_lead('R1', 'A5', 'booked'), 'undersoegelse', now() + interval '20 hours', 'booked');   -- skal have påmindelse
select tt.mk_booking(tt.mk_lead('R2', 'A5', 'booked'), 'undersoegelse', now() + interval '30 hours', 'booked');   -- for tidligt
select tt.mk_booking(tt.mk_lead('R3', 'A5', 'booked'), 'undersoegelse', now() + interval '10 hours', 'booked');   -- booket mindre end et døgn før
select tt.mk_booking(tt.mk_lead('R4', 'A5', 'accepted'), 'undersoegelse', now() + interval '21 hours', 'cancelled');
update public.bookings set created_at = now() - interval '3 days'
 where lead_id in (tt.lead('R1', 'A5'), tt.lead('R2', 'A5'), tt.lead('R4', 'A5'));
delete from public.notification_outbox;
select tt.as_service();
select tt.eq(public.enqueue_booking_reminders(), 4, 'fire outbox-rækker for den ene booking: patientens push, e-mail og SMS og klinikkens e-mail');
select tt.eq(public.enqueue_booking_reminders(), 0, 'idempotent');
select tt.as_postgres();
select tt.eq(tt.n('patient_booking_reminder'), 1, 'én patient_booking_reminder');
select tt.eq(tt.n('clinic_booking_reminder'), 1, 'én clinic_booking_reminder');
select tt.eq(tt.n('patient_booking_reminder', tt.lead('R1', 'A5')), 1, 'for R1');
select tt.eq((select array_agg(k order by k) from public.notification_outbox, jsonb_object_keys(payload) k where type = 'clinic_booking_reminder'),
             array['bookingId', 'leadId', 'startsAt'], 'payloadens nøgler for klinikken');
-- Slået fra hos klinikken
update public.bookings set created_at = now() - interval '3 days' where lead_id = tt.lead('R3', 'A5');
insert into public.clinic_notification_settings (clinic_id, email_booking_reminder) values (tt.cid('A5'), false);
select tt.as_service();
select tt.eq(public.enqueue_booking_reminders(), 3, 'kun patientens påmindelse (push, e-mail, SMS), når klinikken har slået dem fra');

rollback;
