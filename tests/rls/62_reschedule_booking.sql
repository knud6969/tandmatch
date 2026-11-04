-- Test 62 (RLS-punkt 57; features/booking/README.md 10.16; migration 20261106000100_reschedule_booking):
--  * reschedule_booking(): kun ejeren af en booket tid før starttid; held, cancelled, fremmed booking, klinik, anonym og samme tid afvises.
--  * SLOT_TAKEN er atomisk: den gamle booking står stadig som booked.
--  * Efter succes: gammel cancelled (patient), ny booked med rescheduled_from_id, leadet stadig booked, kontakt kun på den nye.
--  * Outboxen har én clinic_booking_rescheduled (med previousStartsAt) og ingen clinic_booking_cancelled.
--  * BOOKING_LIMIT gælder.
begin;
\ir _helpers.sql
\ir _fixtures.sql

select tt.mk_case('pB', 'SB_e');
select tt.as_user(tt.id('pA'));
select public.send_leads(tt.id('S'), array[tt.cid('X')]);
select tt.as_user(tt.id('pB'));
select public.send_leads(tt.id('SB'), array[tt.cid('X')]);
select tt.as_user(tt.id('uX'));
select public.clinic_decide_lead(tt.lead('S', 'X'), 'accept');
select public.clinic_decide_lead(tt.lead('SB', 'X'), 'accept');
select tt.as_postgres();
delete from public.notification_outbox;

-- pB har en booking i den tid, pA vil flytte til.
select tt.as_user(tt.id('pB'));
select public.book_slot(tt.lead('SB', 'X'), tt.svc('undersoegelse'), tt.slot(4, 11), 'Bo Test', '+45 87654321');
select tt.as_user(tt.id('pA'));
select set_config('tt.old', public.book_slot(tt.lead('S', 'X'), tt.svc('undersoegelse'), tt.slot(3, 10), 'Alma Test', '+45 12345678')::text, true);
select tt.as_postgres();
delete from public.notification_outbox;

-- Afvisninger
select tt.as_user(tt.id('pB'));
select tt.denied(format('select public.reschedule_booking(%L::uuid, %L)', current_setting('tt.old'), tt.slot(5, 10)), 'en andens booking er NOT_FOUND', 'NOT_FOUND');
select tt.as_user(tt.id('uX'));
select tt.denied(format('select public.reschedule_booking(%L::uuid, %L)', current_setting('tt.old'), tt.slot(5, 10)), 'klinikken kan ikke flytte', 'NOT_FOUND');
select tt.as_anon();
select tt.denied(format('select public.reschedule_booking(%L::uuid, %L)', current_setting('tt.old'), tt.slot(5, 10)), 'anonym kan ikke flytte');
select tt.as_user(tt.id('pA'));
select tt.denied(format('select public.reschedule_booking(%L::uuid, %L)', current_setting('tt.old'), tt.slot(3, 10)), 'samme tid afvises', 'SAME_SLOT');
select tt.denied(format('select public.reschedule_booking(%L::uuid, %L)', current_setting('tt.old'), tt.slot(3, 7)), 'tid uden for åbningstid', 'SLOT_UNAVAILABLE');
select tt.denied(format('select public.reschedule_booking(%L::uuid, %L)', current_setting('tt.old'), tt.slot(3, 10, 7)), 'ikke et helt kvarter', 'SLOT_UNAVAILABLE');
-- SLOT_TAKEN er atomisk: den gamle står stadig som booked, og leadet er booked.
select tt.denied(format('select public.reschedule_booking(%L::uuid, %L)', current_setting('tt.old'), tt.slot(4, 11)), 'optaget tid afvises', 'SLOT_TAKEN');
select tt.eq((select status::text from public.patient_bookings(current_setting('tt.old')::uuid)), 'booked', 'efter SLOT_TAKEN er den gamle stadig booked');
select tt.eq((select status::text from public.leads where id = tt.lead('S', 'X')), 'booked', 'leadet er stadig booked');
select tt.as_postgres();
select tt.eq((select count(*)::int from public.notification_outbox), 0, 'afvist flytning lægger intet i outboxen');

-- Succes
select tt.as_user(tt.id('pA'));
select set_config('tt.new', public.reschedule_booking(current_setting('tt.old')::uuid, tt.slot(5, 14))::text, true);
select tt.ok(current_setting('tt.new')::uuid <> current_setting('tt.old')::uuid, 'ny booking har nyt id');
select tt.eq((select status::text from public.patient_bookings(current_setting('tt.old')::uuid)), 'cancelled', 'gammel er cancelled');
select tt.eq((select cancelled_by::text from public.patient_bookings(current_setting('tt.old')::uuid)), 'patient', 'gammel er aflyst af patienten');
select tt.eq((select rescheduled_to_starts_at from public.patient_bookings(current_setting('tt.old')::uuid)), tt.slot(5, 14), 'gammel viser rescheduled_to');
select tt.eq((select status::text from public.patient_bookings(current_setting('tt.new')::uuid)), 'booked', 'ny er booked');
select tt.eq((select rescheduled_from_starts_at from public.patient_bookings(current_setting('tt.new')::uuid)), tt.slot(3, 10), 'ny viser rescheduled_from');
select tt.eq((select service_id from public.patient_bookings(current_setting('tt.new')::uuid)), tt.svc('undersoegelse'), 'samme behandling');
select tt.eq((select status::text from public.leads where id = tt.lead('S', 'X')), 'booked', 'leadet er booked efter flytning');
select tt.denied(format('update public.bookings set rescheduled_from_id = null where id = %L::uuid', current_setting('tt.new')), 'ingen direkte skrivning', '42501');

-- Klinikken: kontakt kun på den nye
select tt.as_user(tt.id('uX'));
select tt.eq((select contact_name from public.clinic_booking(current_setting('tt.new')::uuid)), 'Alma Test', 'klinikken ser kontakt på den nye');
select tt.eq((select contact_name from public.clinic_booking(current_setting('tt.old')::uuid)), null::text, 'ingen kontakt på den gamle');
select tt.eq((select rescheduled_from_starts_at from public.clinic_booking(current_setting('tt.new')::uuid)), tt.slot(3, 10), 'klinikken ser rescheduled_from');
select tt.eq((select rescheduled_to_starts_at from public.clinic_bookings(now(), now() + interval '30 days') where booking_id = current_setting('tt.old')::uuid), tt.slot(5, 14), 'klinikken ser rescheduled_to');

-- Outbox
select tt.as_postgres();
select tt.eq((select count(*)::int from public.notification_outbox where type = 'clinic_booking_rescheduled' and channel = 'email'), 1, 'én clinic_booking_rescheduled');
select tt.eq((select count(*)::int from public.notification_outbox where type = 'clinic_booking_cancelled'), 0, 'ingen clinic_booking_cancelled');
select tt.eq((select count(*)::int from public.notification_outbox where type = 'clinic_booking_created'), 0, 'ingen clinic_booking_created for den nye');
select tt.eq((select payload->>'previousStartsAt' from public.notification_outbox where type = 'clinic_booking_rescheduled' and channel = 'email'),
             public.notification_iso(tt.slot(3, 10)), 'previousStartsAt i payload');
select tt.eq((select payload - array['leadId', 'bookingId', 'startsAt', 'previousStartsAt'] from public.notification_outbox where type = 'clinic_booking_rescheduled' and channel = 'email'),
             '{}'::jsonb, 'payload har kun id''er og tidspunkter');

-- Den gamle kan ikke flyttes (aflyst); en senere aflysning af en anden booking giver stadig clinic_booking_cancelled (flaget er nulstillet)
select tt.as_user(tt.id('pA'));
select tt.denied(format('select public.reschedule_booking(%L::uuid, %L)', current_setting('tt.old'), tt.slot(6, 10)), 'aflyst booking kan ikke flyttes', 'BOOKING_NOT_RESCHEDULABLE');
select tt.allowed(format('select public.cancel_booking(%L::uuid)', current_setting('tt.new')), 'den nye kan aflyses');
select tt.as_postgres();
select tt.eq((select count(*)::int from public.notification_outbox where type = 'clinic_booking_cancelled' and channel = 'email'), 1, 'aflysning giver clinic_booking_cancelled efter flytning');

-- Loft: 5 bookinger pr. lead (aflyste af klinikken tæller ikke)
select tt.as_user(tt.id('pB'));
select set_config('tt.b', (select booking_id::text from public.patient_bookings() where lead_id = tt.lead('SB', 'X') and status = 'booked'), true);
select tt.allowed(format('select public.reschedule_booking(%L::uuid, %L)', current_setting('tt.b'), tt.slot(7, 10)), 'flytning 1');
select set_config('tt.b', (select booking_id::text from public.patient_bookings() where lead_id = tt.lead('SB', 'X') and status = 'booked'), true);
select tt.allowed(format('select public.reschedule_booking(%L::uuid, %L)', current_setting('tt.b'), tt.slot(8, 10)), 'flytning 2');
select set_config('tt.b', (select booking_id::text from public.patient_bookings() where lead_id = tt.lead('SB', 'X') and status = 'booked'), true);
select tt.allowed(format('select public.reschedule_booking(%L::uuid, %L)', current_setting('tt.b'), tt.slot(9, 10)), 'flytning 3');
select set_config('tt.b', (select booking_id::text from public.patient_bookings() where lead_id = tt.lead('SB', 'X') and status = 'booked'), true);
select tt.allowed(format('select public.reschedule_booking(%L::uuid, %L)', current_setting('tt.b'), tt.slot(10, 10)), 'flytning 4 (5. booking)');
select set_config('tt.b', (select booking_id::text from public.patient_bookings() where lead_id = tt.lead('SB', 'X') and status = 'booked'), true);
select tt.denied(format('select public.reschedule_booking(%L::uuid, %L)', current_setting('tt.b'), tt.slot(11, 10)), 'loftet på 5 bookinger gælder', 'BOOKING_LIMIT');
select tt.eq((select status::text from public.patient_bookings(current_setting('tt.b')::uuid)), 'booked', 'efter BOOKING_LIMIT står den nuværende stadig');

-- Held kan ikke flyttes
select tt.as_postgres();
select tt.mk_case('pA', 'S_h');
select tt.mk_booking(tt.mk_lead('S_h', 'X', 'sent'), 'akut_konsultation', tt.slot(2, 18), 'held', 30);
select set_config('tt.h', tt.booking(tt.lead('S_h', 'X'))::text, true);
select tt.as_user(tt.id('pA'));
select tt.denied(format('select public.reschedule_booking(%L::uuid, %L)', current_setting('tt.h'), tt.slot(3, 18)), 'held kan ikke flyttes', 'BOOKING_NOT_RESCHEDULABLE');

rollback;
